const { sendData, sendPaginated } = require('../utils/response');
const meta = (request) => ({ correlationId: request.correlationId, userId: request.user.id, userRole: request.user.role });
const mapNotification = (notification) => ({ ...notification, data: JSON.parse(notification.dataJson || '{}'), dataJson: undefined });
function createNotificationController(clients) {
  return {
    list: async (request, response, next) => {
      try {
        const result = await clients.notify.call('listNotifications', request.query, meta(request));
        return sendPaginated(response, result.items.map(mapNotification), result.pageInfo);
      } catch (error) { return next(error); }
    },
    read: async (request, response, next) => {
      try { return sendData(response, await clients.notify.call('markRead', { notificationId: request.params.id }, meta(request))); } catch (error) { return next(error); }
    },
    readAll: async (request, response, next) => {
      try { return sendData(response, await clients.notify.call('markAllRead', {}, meta(request))); } catch (error) { return next(error); }
    }
  };
}
module.exports = { createNotificationController };
