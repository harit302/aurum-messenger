import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();
const router = express.Router();

// Email transporter (for password recovery)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { login, email, password } = req.body;

    // Validation
    if (!login || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ login }, { email }] }
    });

    if (existingUser) {
      return res.status(400).json({ 
        error: existingUser.login === login ? "Login already taken" : "Email already in use" 
      });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: { login, email, password: hash },
      select: { id: true, login: true, email: true, createdAt: true }
    });

    // Generate token
    const token = jwt.sign(
      { id: user.id, login: user.login },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(201).json({
      success: true,
      message: "Registration successful",
      user,
      token
    });

  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: "Login and password required" });
    }

    // Find user by login or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { login: login },
          { email: login }
        ]
      }
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, login: user.login },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        login: user.login,
        email: user.email
      },
      token
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// PASSWORD RECOVERY
router.post("/recover", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal that email doesn't exist
      return res.json({ 
        success: true, 
        message: "If email exists, recovery code will be sent" 
      });
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000);

    // Send email
    await transporter.sendMail({
      from: `"AURUM" <${process.env.SMTP_USER || "noreply@aurum.com"}>`,
      to: email,
      subject: "Password Recovery Code",
      text: `Your recovery code: ${code}`,
      html: `<h3>Your recovery code:</h3><p><b>${code}</b></p>`
    });

    // In real app, save code hash to database with expiration
    res.json({
      success: true,
      message: "Recovery code sent",
      // Don't send code in production!
      code: process.env.NODE_ENV === "development" ? code : undefined
    });

  } catch (error) {
    console.error("Recovery error:", error);
    res.status(500).json({ error: "Failed to send recovery code" });
  }
});

// GET CURRENT USER
router.get("/me", async (req, res) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        login: true,
        email: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
