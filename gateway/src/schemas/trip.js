const { z }=require('zod'); const {isUuid}=require('../utils/uuid');
module.exports={id:z.object({id:z.string().refine(isUuid)}),bookingId:z.object({bookingId:z.string().refine(isUuid)})};
