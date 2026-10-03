const express = require("express");
const { authenticate } = require("../middlewares/auth");
const { validate } = require("../utils/validate");
const s = require("../schemas/notification");
const {
  createNotificationController,
} = require("../controllers/notificationController");
function createNotificationRouter(c) {
  const r = express.Router(),
    x = createNotificationController(c);
  r.get("/", authenticate, validate(s.list, "query"), x.list);
  r.post("/read-all", authenticate, x.readAll);
  r.post("/:id/read", authenticate, validate(s.id, "params"), x.read);
  return r;
}
module.exports = { createNotificationRouter };
