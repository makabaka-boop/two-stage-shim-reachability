# 构建阶段：安装全部依赖，执行类型检查/单测并产出静态文件
FROM node:20-alpine AS build
WORKDIR /app

# 先复制依赖清单以利用 Docker 层缓存
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run verify

# 运行阶段：仅用 nginx 托管静态产物
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:80/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
