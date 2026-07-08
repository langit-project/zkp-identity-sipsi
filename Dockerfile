# Use Node.js LTS version
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install -g nodemon
RUN npm install

# Copy source code
COPY . .

# Expose the port the app runs on
EXPOSE 3002

# Use nodemon for auto-reload
CMD ["nodemon", "--legacy-watch", "index.js"]
