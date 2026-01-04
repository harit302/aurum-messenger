import { Server } from "socket.io";
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function initSocket(server) {
  const io = new Server(server, { 
    cors: { 
      origin: process.env.FRONTEND_URL || "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true
    }
  });

  io.on("connection", socket => {
    console.log(`✅ WebSocket подключён: ${socket.id}`);

    // Присоединение к чату
    socket.on("join", chatId => {
      socket.join(chatId);
      console.log(`👥 ${socket.id} присоединился к чату ${chatId}`);
      
      // Отправляем историю сообщений
      prisma.message.findMany({
        where: { chatId },
        orderBy: { createdAt: "asc" },
        take: 50,
        include: { user: { select: { login: true } } }
      }).then(messages => {
        socket.emit("history", messages);
      });
    });

    // Отправка сообщения
    socket.on("message", async ({ chatId, text, userId }) => {
      try {
        if (!text || text.trim().length === 0) {
          socket.emit("error", "Сообщение не может быть пустым");
          return;
        }

        if (text.length > 2000) {
          socket.emit("error", "Сообщение слишком длинное");
          return;
        }

        // Сохраняем в БД
        const message = await prisma.message.create({
          data: { 
            text: text.trim(), 
            userId, 
            chatId 
          },
          include: {
            user: {
              select: {
                id: true,
                login: true,
                email: true
              }
            }
          }
        });
        
        // Отправляем всем в комнате
        io.to(chatId).emit("message", {
          id: message.id,
          text: message.text,
          user: {
            id: message.user.id,
            login: message.user.login
          },
          createdAt: message.createdAt,
          time: new Date().toISOString()
        });

        console.log(`💬 Сообщение от ${userId} в ${chatId}: ${text.substring(0, 30)}...`);
      } catch (error) {
        console.error("❌ Ошибка сохранения сообщения:", error);
        socket.emit("error", "Не удалось отправить сообщение");
      }
    });

    // Присоединение к каналу
    socket.on("join-channel", channelId => {
      socket.join(`channel_${channelId}`);
      console.log(`📢 ${socket.id} присоединился к каналу ${channelId}`);
    });

    // Пинг (для поддержания соединения)
    socket.on("ping", () => {
      socket.emit("pong", { time: Date.now() });
    });

    // Отключение
    socket.on("disconnect", (reason) => {
      console.log(`❌ WebSocket отключён: ${socket.id}, причина: ${reason}`);
    });

    // Ошибка
    socket.on("error", (error) => {
      console.error(`⚠️ Ошибка WebSocket ${socket.id}:`, error);
    });
  });

  // Статистика
  setInterval(() => {
    const socketsCount = io.engine.clientsCount;
    const roomsCount = io.sockets.adapter.rooms.size;
    console.log(`📊 Статистика: ${socketsCount} клиентов, ${roomsCount} комнат`);
  }, 60000); // Каждую минуту

  return io;
}
