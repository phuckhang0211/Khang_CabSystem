# Seed

Start the stack with `docker compose -f docker-compose.yml -f docker-compose.debug.yml up -d --build`, then run `npm i` and `node seed.js` in this directory. The seed reads the repository `.env`; dependencies are limited to PostgreSQL, Redis, and bcrypt helpers needed for host-side seeding.
