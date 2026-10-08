const { sendData, sendPaginated } = require('../utils/response');

const metadata = (request) => ({ correlationId: request.correlationId, userId: request.user.id, userRole: request.user.role });
const view = (review) => ({ id: review.reviewId, tripId: review.tripId, customerId: review.customerId, driverId: review.driverId, rating: review.rating, comment: review.comment, createdAt: review.createdAt });

function createReviewController(clients) {
  return {
    create: async (request, response, next) => {
      try {
        return sendData(response, view(await clients.customer.call('createReview', request.body, metadata(request))), 201);
      } catch (error) { return next(error); }
    },
    list: async (request, response, next) => {
      try {
        const result = await clients.customer.call('listReviews', request.query, metadata(request));
        return sendPaginated(response, { items: result.items.map(view) }, result.pageInfo);
      } catch (error) { return next(error); }
    }
  };
}

module.exports = { createReviewController };
