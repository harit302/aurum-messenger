import express from "express";
import http from "http";
import cors from "cors";
import { initSocket } from "./socket.js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
initSocket(server);

// Импорт маршрутов
import authRoutes from "./auth/auth.js";
import chatRoutes from "./chats/chat.js";
import channelRoutes from "./channels/channels.js";
import botRoutes from "./bots/bots.js";
import mediaRoutes from "./media/media.js";
import paymentRoutes from "./payments/payments.js";

// Подключение маршрутов
app.use("/auth", authRoutes);
app.use("/chat", chatRoutes);
app.use("/channels", channelRoutes);
app.use("/bots", botRoutes);
app.use("/media", mediaRoutes);
app.use("/payments", paymentRoutes);

// Запуск сервера
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 AURUM backend запущен на порту ${PORT}`);
  console.log(`🔗 WebSocket готов на ws://localhost:${PORT}`);
});
