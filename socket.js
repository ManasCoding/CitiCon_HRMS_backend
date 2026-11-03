import { Server } from 'socket.io';

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || origin.endsWith('.vercel.app') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return callback(null, true);
        }
        callback(null, true);
      }, 
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIo = () => {
  if (!io) {
    console.warn('Socket.io not initialized yet!');
    return null;
  }
  return io;
};
