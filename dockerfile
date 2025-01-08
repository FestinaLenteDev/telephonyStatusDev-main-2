# Use official Node.js LTS image
FROM node:20

# Set the working directory in the container
WORKDIR /app

# Copy the package.json and package-lock.json to install dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all the remaining files into the container
COPY . .

# Build the app if necessary (e.g., for React, Angular, etc.)
# For example: RUN npm run build (if you have a build step)

# Expose port 8080 to the outside world
EXPOSE 8080

# Start the server using index.js
CMD ["node", "index.js"]