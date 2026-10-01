const { sendError } = require('../utils/response');
function allow(...roles) {
  return (req, res, next) => (!req.user || !roles.includes(req.user.role)
    ? sendError(res, req, 403, 'FORBIDDEN', 'Access denied') : next());
}
module.exports = { allow };
