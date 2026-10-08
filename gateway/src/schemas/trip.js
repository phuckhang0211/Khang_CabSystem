const { z }=require('zod'); const {isUuid}=require('../utils/uuid');
module.exports={id:z.object({id:z.string().refine(isUuid)}),bookingId:z.object({bookingId:z.string().refine(isUuid)}),empty:z.object({}).strict(),location:z.object({lat:z.number().finite().min(-90).max(90),lng:z.number().finite().min(-180).max(180)}).strict()};
