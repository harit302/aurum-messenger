import express from "express";
import { PrismaClient } from "@prisma/client";
import { authMiddleware } from "../middleware/auth.js";

const prisma = new PrismaClient();
const router = express.Router();

// Получить сообщения чата
router.get("/:chatId", authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { limit = 50 } = req.query;

    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: "desc" },
      take: parseInt(limit),
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

    res.json({
      success: true,
      messages: messages.reverse()
    });
  } catch (error) {
    console.error("Ошибка получения сообщений:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Отправить сообщение
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { text, chatId } = req.body;
    const userId = req.user.id;

    if (!text || !chatId) {
      return res.status(400).json({ error: "Текст и ID чата обязательны" });
    }

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
            login: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      message: message
    });
  } catch (error) {
    console.error("Ошибка отправки сообщения:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

export default router;
