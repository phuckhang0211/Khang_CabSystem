const {sendData}=require('../utils/response');
const meta=r=>({correlationId:r.correlationId,userId:r.user.id,userRole:r.user.role});
function createTripController(clients){return {get:async(r,s,n)=>{try{return sendData(s,await clients.trip.call('getTrip',{tripId:r.params.id},meta(r)))}catch(e){return n(e)}},getByBooking:async(r,s,n)=>{try{return sendData(s,await clients.trip.call('getTripByBooking',{bookingId:r.params.bookingId},meta(r)))}catch(e){return n(e)}}};}
module.exports={createTripController};
