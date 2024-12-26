import express from 'express';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import { sendPushNotification } from '../services/notificationService.js';

const userRouter = express.Router();
dotenv.config();

userRouter.post("/register", async (req, res) => {
  const { username, email, password , fcmToken} = req.body;

  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      console.log(userExists)
      return res.status(400).json({ message: 'User already exists', userExists });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({ username, email, password: hashedPassword , fcmToken});

    await newUser.save();

    const notificationTitle = "Welcome to Bookeez!";
    const notificationMessage = "Your account has been successfully created.";
    const notification = await sendPushNotification(fcmToken, notificationTitle, notificationMessage);

    const afterNotificationAdded = await User.updateOne(
      { _id: newUser._id },
      {
        $push: {
          notifications: {
            title: notificationTitle,
            body: notificationMessage,
            timestamp: new Date().toISOString(),
          },
        },
      }
    );

    res.status(201).json({ message: 'User created successfully', user: afterNotificationAdded , notificationTitle, notificationMessage});
  } catch (error) {
    console.log(error);
    res.status(501).json({ message: `Error registering user ${username, email}`, error });
  }
});

userRouter.get("/user/:id", async (req, res) => {
  try {
    const {id} = req.params;
    const user = await User.findById(id).select("-password");
  
    res.status(200).json({ message: 'User fetched successfully', user});
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: `Error in fetching user`, error });
  }
});

userRouter.get("/user", async (req, res) => {
  try {
    const users = await User.find().select("-password -cart -notifications -fcmToken");
  
    res.status(200).json({ message: 'User fetched successfully', users});
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: `Error in fetching users`, error });
  }
});


userRouter.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Compare provided password with the stored hash
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate a JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });

    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_REFRESH_SECRET_KEY,
      { expiresIn: '7d' }
    );
    const fcmToken = user.fcmToken;
    if(fcmToken != null && user.username != null) {
      const notificationTitle = "Welcome back to Bookeez!";
      const notificationMessage = `Hey ${user.username}, we’re glad to see you again! Ready to explore the latest updates?`;
      const notification = await sendPushNotification(fcmToken, notificationTitle, notificationMessage);
  
      const afterNotificationAdded = await User.updateOne(
        { _id: user._id },
        {
          $push: {
            notifications: {
              title: notificationTitle,
              body: notificationMessage,
              timestamp: new Date().toISOString(),
            },
          },
        }
      );
    }
   

    res.status(200).json({ message: 'Logged in successfully', user, token, refreshToken });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error });
    console.log("error", error);
  }
});

userRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  console.log("Received refreshToken:", refreshToken);
  try {
    // Verify the refresh token
    jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET_KEY, async (err, decoded) => {
      if (err) {
        console.error("JWT Error:", err);
        return res.status(401).json({ message: 'Invalid refresh token' });
      }

      // Get the user associated with the refresh token
      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      // Generate a new access token
      const newAccessToken = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET_KEY,
        { expiresIn: '1h' }
      );

      res.status(200).json({ accessToken: newAccessToken });
    });
  } catch (error) {
    res.status(500).json({ message: 'Error refreshing token', error });
  }
});

export default userRouter;