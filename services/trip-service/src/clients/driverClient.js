const grpc=require('@grpc/grpc-js'),config=require('../config');
const {loadProto}=require('../utils/proto'); const api=loadProto('driver');
const client=new api.cab.driver.v1.DriverService(config.driverGrpcAddr,grpc.credentials.createInsecure());
function getDriver(request,correlationId){const m=new grpc.Metadata();m.set('x-service-token',config.internalServiceToken);if(correlationId)m.set('x-correlation-id',correlationId);return new Promise((resolve,reject)=>client.getDriver(request,m,{deadline:new Date(Date.now()+config.grpcDeadlineMs)},(e,r)=>e?reject(e):resolve(r)));}
module.exports={getDriver};
