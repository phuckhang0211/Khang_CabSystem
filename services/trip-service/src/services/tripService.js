const crypto=require('crypto'),grpc=require('@grpc/grpc-js');
const repo=require('../repositories/tripRepo'),driver=require('../clients/driverClient');
const {publish}=require('../events/rabbit');
const logger=require('../utils/logger');
const {escapeHtml}=require('../utils/escapeHtml');
const {makeError}=require('../utils/errors'); const isUuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const fail=(code,name,message)=>makeError(code,name,message);
function view(r,driverInfo){return {tripId:r.id,bookingId:r.booking_id,customerId:r.customer_id,driverId:r.driver_id,driver:driverInfo||undefined,status:r.status,paymentStatus:r.payment_status,paymentId:r.payment_id,paidAt:new Date(r.paid_at).toISOString(),fare:Number(r.fare),vehicleId:r.vehicle_id,pickup:{lat:Number(r.pickup_lat),lng:Number(r.pickup_lng),address:r.pickup_address||''},destination:{lat:Number(r.dest_lat),lng:Number(r.dest_lng),address:r.dest_address||''},lastLocation:r.last_lat===null?undefined:{lat:Number(r.last_lat),lng:Number(r.last_lng)},endLocation:r.end_lat===null?undefined:{lat:Number(r.end_lat),lng:Number(r.end_lng)},lastLat:r.last_lat===null?undefined:Number(r.last_lat),lastLng:r.last_lng===null?undefined:Number(r.last_lng),locationUpdatedAt:r.location_updated_at?new Date(r.location_updated_at).toISOString():'',endLat:r.end_lat===null?undefined:Number(r.end_lat),endLng:r.end_lng===null?undefined:Number(r.end_lng),arrivedAt:r.arrived_at?new Date(r.arrived_at).toISOString():'',startedAt:r.started_at?new Date(r.started_at).toISOString():'',completedAt:r.completed_at?new Date(r.completed_at).toISOString():'',canceledAt:r.canceled_at?new Date(r.canceled_at).toISOString():'',canceledBy:r.canceled_by||'',cancelReason:r.cancel_reason||'',createdAt:new Date(r.created_at).toISOString()};}
async function consume(event){if(!event||event.eventType!=='booking.assigned'||!event.payload)return;const p=event.payload;if(![p.tripId,p.bookingId,p.customerId,p.driverId,p.vehicleId,p.paymentId].every(isUuid)||!Number.isFinite(p.fare)||Number.isNaN(new Date(p.paidAt).getTime()))throw Error('Invalid booking.assigned payload');await repo.insertFromAssigned({id:p.tripId,...p});}
async function authorize(row,caller){if(!caller.userId) return; if(caller.role==='ADMIN'||(caller.role==='CUSTOMER'&&row.customer_id===caller.userId))return;if(caller.role==='DRIVER'){let d;try{d=await driver.getDriver({userId:caller.userId},caller.correlationId);}catch(_){throw fail(grpc.status.PERMISSION_DENIED,'FORBIDDEN','Access denied');}if(d.driverId===row.driver_id)return;}throw fail(grpc.status.PERMISSION_DENIED,'FORBIDDEN','Access denied');}
async function tripView(row,caller){const driverInfo=await driver.getDriver({driverId:row.driver_id},caller.correlationId);return view(row,driverInfo);}
async function getTrip({tripId},caller){if(!isUuid(tripId))throw fail(grpc.status.INVALID_ARGUMENT,'VALIDATION_ERROR','Invalid trip id');const row=await repo.get(tripId);if(!row)throw fail(grpc.status.NOT_FOUND,'NOT_FOUND','Trip not found');await authorize(row,caller);return tripView(row,caller);}
async function getTripByBooking({bookingId},caller){if(!isUuid(bookingId))throw fail(grpc.status.INVALID_ARGUMENT,'VALIDATION_ERROR','Invalid booking id');const row=await repo.getByBooking(bookingId);if(!row)throw fail(grpc.status.NOT_FOUND,'NOT_FOUND','Trip not found');await authorize(row,caller);return tripView(row,caller);}
async function assignedTrip(tripId,caller){
  if(!isUuid(tripId))throw fail(grpc.status.INVALID_ARGUMENT,'VALIDATION_ERROR','Invalid trip id');
  const row=await repo.get(tripId);
  if(!row)throw fail(grpc.status.NOT_FOUND,'NOT_FOUND','Trip not found');
  if(caller.role!=='DRIVER'||!caller.userId)throw fail(grpc.status.PERMISSION_DENIED,'FORBIDDEN','Forbidden');
  let identity;
  try{identity=await driver.getDriver({userId:caller.userId},caller.correlationId);}catch(_){throw fail(grpc.status.PERMISSION_DENIED,'FORBIDDEN','Forbidden');}
  if(identity.driverId!==row.driver_id)throw fail(grpc.status.PERMISSION_DENIED,'FORBIDDEN','Forbidden');
  return row;
}
async function changeStatus({tripId},caller,from,to,column,eventType){
  const row=await assignedTrip(tripId,caller);
  if(row.status!==from)throw fail(grpc.status.ABORTED,'STATE_CONFLICT','Trip state conflict');
  const driverInfo=await driver.getDriver({driverId:row.driver_id},caller.correlationId);
  const changed=await repo.transition(tripId,from,to,column);
  if(!changed)throw fail(grpc.status.ABORTED,'STATE_CONFLICT','Trip state conflict');
  if(eventType==='trip.completed'){
    try{await driver.releaseDriver({driverId:row.driver_id,bookingId:row.booking_id},caller.correlationId);}
    catch(_){logger.error('Driver release failed after trip completion',caller.correlationId);}
  }
  await publish(eventType,{tripId:row.id,bookingId:row.booking_id,customerId:row.customer_id,driverId:row.driver_id,driverUserId:driverInfo.userId},{correlationId:caller.correlationId,aggregateId:row.id});
  return view(changed);
}
const arrive=(input,caller)=>changeStatus(input,caller,'DRIVER_ARRIVING','DRIVER_ARRIVED','arrived_at','trip.arrived');
const start=(input,caller)=>changeStatus(input,caller,'DRIVER_ARRIVED','IN_PROGRESS','started_at','trip.started');
const complete=(input,caller)=>changeStatus(input,caller,'IN_PROGRESS','COMPLETED','completed_at','trip.completed');
async function updateTripLocation({tripId,lat,lng},caller){
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180)throw fail(grpc.status.INVALID_ARGUMENT,'INVALID_COORDINATES','Invalid coordinates');
  const row=await assignedTrip(tripId,caller);
  if(row.status!=='IN_PROGRESS')throw fail(grpc.status.ABORTED,'STATE_CONFLICT','Trip state conflict');
  const changed=await repo.updateLocation(tripId,lat,lng);
  if(!changed)throw fail(grpc.status.ABORTED,'STATE_CONFLICT','Trip state conflict');
  return view(changed);
}
async function cancel({tripId,reason,confirm},caller){
  if(!isUuid(tripId))throw fail(grpc.status.INVALID_ARGUMENT,'VALIDATION_ERROR','Invalid trip id');
  const row=await repo.get(tripId);
  if(!row)throw fail(grpc.status.NOT_FOUND,'NOT_FOUND','Trip not found');
  if(!caller.userId||!['CUSTOMER','DRIVER'].includes(caller.role))throw fail(grpc.status.PERMISSION_DENIED,'FORBIDDEN','Forbidden');
  if(caller.role==='CUSTOMER'){
    if(row.customer_id!==caller.userId)throw fail(grpc.status.PERMISSION_DENIED,'FORBIDDEN','Forbidden');
  }else{
    let identity;
    try{identity=await driver.getDriver({userId:caller.userId},caller.correlationId);}catch(_){throw fail(grpc.status.PERMISSION_DENIED,'FORBIDDEN','Forbidden');}
    if(identity.driverId!==row.driver_id)throw fail(grpc.status.PERMISSION_DENIED,'FORBIDDEN','Forbidden');
  }
  if(typeof reason!=='string'||reason.length<5||reason.length>200)throw fail(grpc.status.INVALID_ARGUMENT,'VALIDATION_ERROR','Invalid cancel reason');
  if(confirm!==true)throw fail(grpc.status.INVALID_ARGUMENT,'CONFIRM_REQUIRED','Confirmation required');
  const safeReason=escapeHtml(reason);
  if(safeReason.length>200)throw fail(grpc.status.INVALID_ARGUMENT,'VALIDATION_ERROR','Invalid cancel reason');
  if(!['DRIVER_ARRIVING','DRIVER_ARRIVED'].includes(row.status))throw fail(grpc.status.ABORTED,'TRIP_CANNOT_BE_CANCELED','Trip cannot be canceled');
  const driverInfo=await driver.getDriver({driverId:row.driver_id},caller.correlationId);
  const changed=await repo.cancel(tripId,caller.role,safeReason);
  if(!changed)throw fail(grpc.status.ABORTED,'TRIP_CANNOT_BE_CANCELED','Trip cannot be canceled');
  try{await driver.releaseDriver({driverId:row.driver_id,bookingId:row.booking_id},caller.correlationId);}
  catch(_){logger.error('Driver release failed after trip cancellation',caller.correlationId);}
  await publish('trip.canceled',{tripId:row.id,bookingId:row.booking_id,customerId:row.customer_id,driverId:row.driver_id,driverUserId:driverInfo.userId,canceledBy:caller.role,reason:safeReason},{correlationId:caller.correlationId,aggregateId:row.id});
  return view(changed);
}
module.exports={consume,getTrip,getTripByBooking,arrive,start,complete,updateTripLocation,cancel};
