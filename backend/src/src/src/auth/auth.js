import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();
const router = express.Router();

// Настройка почты (для восстановления пароля)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Регистрация
router.post("/register", async (req, res) => {
  try {
    const { login, email, password } = req.body;

    // Валидация
    if (!login || !email || !password) {
      return res.status(400).json({ error: "Все поля обязательны" });
    }

    if (login.length < 3 || login.length > 20) {
      return res.status(400).json({ error: "Логин должен быть от 3 до 20 символов" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Пароль должен быть не менее 6 символов" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Неверный формат email" });
    }

    // Проверка существующих пользователей
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ login }, { email }]
      }
    });

    if (existingUser) {
      return res.status(400).json({ 
        error: existingUser.login === login ? "Логин уже занят" : "Email уже используется" 
      });
    }

    // Хеширование пароля
    const hash = await bcrypt.hash(password, 12);

    // Создание пользователя
    const user = await prisma.user.create({
      data: { 
        login, 
        email, 
        password: hash 
      },
      select: {
        id: true,
        login: true,
        email: true,
        createdAt: true
      }
    });

    // Генерация токена
    const token = jwt.sign(
      { 
        id: user.id,
        login: user.login,
        email: user.email 
      }, 
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Отправка приветственного email
    try {
      await transporter.sendMail({
        from: `"AURUM Messenger" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Добро пожаловать в AURUM!",
        text: `Привет, ${login}! Добро пожаловать в AURUM Messenger.`,
        html: `<h2>Добро пожаловать, ${login}!</h2><p>Спасибо за регистрацию в AURUM Messenger.</p>`
      });
    } catch (emailError) {
      console.warn("Не удалось отправить приветственное письмо:", emailError);
    }

    res.status(201).json({ 
      success: true,
      message: "Регистрация успешна",
      user,
      token
    });

  } catch (error) {
    console.error("Ошибка регистрации:", error);
    res.status(500).json({ 
      error: "Внутренняя ошибка сервера",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

// Логин
router.post("/login", async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: "Логин и пароль обязательны" });
    }

    // Поиск пользователя по логину или email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { login: login },
          { email: login }
        ]
      },
      include: {
        premium: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }

    // Проверка пароля
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }

    // Генерация токена
    const token = jwt.sign(
      { 
        id: user.id,
        login: user.login,
        email: user.email,
        premium: !!user.premium && user.premium.until > new Date()
      }, 
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Обновляем время последнего входа
    await prisma.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() }
    });

    res.json({
      success: true,
      message: "Вход выполнен успешно",
      user: {
        id: user.id,
        login: user.login,
        email: user.email,
        premium: user.premium,
        createdAt: user.createdAt
      },
      token
    });

  } catch (error) {
    console.error("Ошибка входа:", error);
    res.status(500).json({ 
      error: "Внутренняя ошибка сервера",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

// Восстановление пароля
router.post("/recover", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email обязателен" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Для безопасности не сообщаем, что email не найден
      return res.json({ 
        success: true,
        message: "Если email зарегистрирован, вы получите письмо с кодом"
      });
    }

    // Генерация кода (6 цифр)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 минут

    // Сохранение кода в БД (в реальном проекте используйте отдельную таблицу)
    // Здесь упрощённый вариант - просто возвращаем код
    
    // Отправка email
    await transporter.sendMail({
      from: `"AURUM Messenger" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Восстановление пароля AURUM",
      text: `Ваш код восстановления: ${code}. Код действителен 15 минут.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Восстановление пароля AURUM</h2>
          <p>Ваш код восстановления:</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${code}
          </div>
          <p>Код действителен в течение 15 минут.</p>
          <p>Если вы не запрашивали восстановление пароля, проигнорируйте это письмо.</p>
        </div>
      `
    });

    // В реальном проекте здесь нужно сохранить хеш кода в БД
    const codeHash = await bcrypt.hash(code, 10);
    const recoveryData = JSON.stringify({ code: codeHash, expires: codeExpires });
    
    res.json({
      success: true,
      message: "Код отправлен на email",
      // В реальном проекте не отправляем код в ответе
      // Это только для демонстрации
      code: process.env.NODE_ENV === "development" ? code : undefined
    });

  } catch (error) {
    console.error("Ошибка восстановления пароля:", error);
    res.status(500).json({ 
      error: "Не удалось отправить код восстановления",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

// Проверка кода восстановления
router.post("/verify-code", async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "Email и код обязательны" });
    }

    // В реальном проекте проверяем код из БД
    // Здесь упрощённая проверка
    const isValid = code.length === 6 && /^\d+$/.test(code);
    
    if (!isValid) {
      return res.status(400).json({ error: "Неверный код" });
    }

    res.json({
      success: true,
      message: "Код подтверждён",
      resetToken: jwt.sign({ email, action: "reset" }, process.env.JWT_SECRET, { expiresIn: "15m" })
    });

  } catch (error) {
    console.error("Ошибка проверки кода:", error);
    res.status(500).json({ error: "Ошибка проверки кода" });
  }
});

// Сброс пароля
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: "Токен и новый пароль обязательны" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Пароль должен быть не менее 6 символов" });
    }

    // Верификация токена
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(400).json({ error: "Недействительный или просроченный токен" });
    }

    if (decoded.action !== "reset") {
      return res.status(400).json({ error: "Неверный тип токена" });
    }

    const { email } = decoded;

    // Поиск пользователя
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    // Хеширование нового пароля
    const hash = await bcrypt.hash(newPassword, 12);

    // Обновление пароля
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hash }
    });

    // Отправка уведомления
    try {
      await transporter.sendMail({
        from: `"AURUM Messenger" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Пароль изменён",
        text: "Ваш пароль в AURUM Messenger был успешно изменён.",
        html: `<p>Ваш пароль в AURUM Messenger был успешно изменён.</p>`
      });
    } catch (emailError) {
      console.warn("Не удалось отправить уведомление:", emailError);
    }

    res.json({
      success: true,
      message: "Пароль успешно изменён"
    });

  } catch (error) {
    console.error("Ошибка сброса пароля:", error);
    res.status(500).json({ error: "Ошибка сброса пароля" });
  }
});

// Получение информации о текущем пользователе
router.get("/me", async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: "Токен не предоставлен" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        login: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        premium: true,
        _count: {
          select: {
            messages: true,
            channels: true,
            bots: true,
            subscriptions: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error("Ошибка получения информации:", error);
    
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Недействительный токен" });
    }
    
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Токен просрочен" });
    }
    
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

export default router;
