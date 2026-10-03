const { z } = require("zod");
const { isUuid } = require("../utils/uuid");
module.exports = {
  list: z.object({
    unread: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
  id: z.object({ id: z.string().refine(isUuid) }),
};
