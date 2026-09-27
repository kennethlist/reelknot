FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html maps.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine
# nginx.conf is an envsubst template. The entrypoint exports the container's
# nameservers as NGINX_LOCAL_RESOLVERS; only that variable is substituted
# (the filter keeps nginx's own $variables intact).
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 NGINX_ENVSUBST_FILTER=^NGINX_LOCAL_RESOLVERS$
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
