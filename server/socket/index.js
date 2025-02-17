const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const getUserDetailsFromToken = require('../helpers/getUserDetailsFromToken');
const UserModel = require('../models/UserModel');
const { ConversationModel, MessageModel } = require('../models/ConversationModel');
const getConversation = require('../helpers/getConversation');

const app = express();

/*** Socket connection */
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true
  }
});

/***
 * Socket running at http://localhost:8080/
 */

// Online users
const onlineUsers = new Set();

io.on('connection', async (socket) => {
  console.log("connect User ", socket.id);

  const token = socket.handshake.auth.token;

  // Get current user details
  let user;
  try {
    user = await getUserDetailsFromToken(token);
    if (user && user._id) {
      socket.join(user._id.toString());
      onlineUsers.add(user._id.toString());
      io.emit('onlineUser', Array.from(onlineUsers));
    } else {
      console.error('User not found or missing _id');
      return;
    }
  } catch (error) {
    console.error('Error getting user details from token:', error);
    return;
  }

  socket.on('message-page', async (userId) => {
    try {
      console.log('userId', userId);
      const userDetails = await UserModel.findById(userId).select("-password");

      if (!userDetails) {
        console.error('User details not found:', userId);
        return;
      }

      const payload = {
        _id: userDetails._id,
        name: userDetails.name,
        email: userDetails.email,
        profile_pic: userDetails.profile_pic,
        online: onlineUsers.has(userId)
      };
      socket.emit('message-user', payload);

      // Get previous messages
      const getConversationMessage = await ConversationModel.findOne({
        "$or": [
          { sender: user._id, receiver: userId },
          { sender: userId, receiver: user._id }
        ]
      }).populate('messages').sort({ updatedAt: -1 });

      socket.emit('message', getConversationMessage?.messages || []);
    } catch (error) {
      console.error('Error in message-page handler:', error);
    }
  });

  socket.on('new message', async (data) => {
    try {
      let conversation = await ConversationModel.findOne({
        "$or": [
          { sender: data.sender, receiver: data.receiver },
          { sender: data.receiver, receiver: data.sender }
        ]
      });

      if (!conversation) {
        const createConversation = await ConversationModel({
          sender: data.sender,
          receiver: data.receiver
        });
        conversation = await createConversation.save();
      }

      const message = new MessageModel({
        text: data.text,
        imageUrl: data.imageUrl,
        videoUrl: data.videoUrl,
        msgByUserId: data.msgByUserId,
      });
      const saveMessage = await message.save();

      await ConversationModel.updateOne({ _id: conversation._id }, {
        "$push": { messages: saveMessage._id }
      });

      const getConversationMessage = await ConversationModel.findOne({
        "$or": [
          { sender: data.sender, receiver: data.receiver },
          { sender: data.receiver, receiver: data.sender }
        ]
      }).populate('messages').sort({ updatedAt: -1 });

      io.to(data.sender).emit('message', getConversationMessage?.messages || []);
      io.to(data.receiver).emit('message', getConversationMessage?.messages || []);

      const conversationSender = await getConversation(data.sender);
      const conversationReceiver = await getConversation(data.receiver);

      io.to(data.sender).emit('conversation', conversationSender);
      io.to(data.receiver).emit('conversation', conversationReceiver);
    } catch (error) {
      console.error('Error in new message handler:', error);
    }
  });

  socket.on('sidebar', async (currentUserId) => {
    try {
      console.log("current user", currentUserId);
      const conversation = await getConversation(currentUserId);
      socket.emit('conversation', conversation);
    } catch (error) {
      console.error('Error in sidebar handler:', error);
    }
  });

  socket.on('seen', async (msgByUserId) => {
    try {
      let conversation = await ConversationModel.findOne({
        "$or": [
          { sender: user._id, receiver: msgByUserId },
          { sender: msgByUserId, receiver: user._id }
        ]
      });

      if (!conversation) {
        console.error('Conversation not found for seen:', user._id, msgByUserId);
        return;
      }

      const conversationMessageId = conversation.messages || [];

      await MessageModel.updateMany(
        { _id: { "$in": conversationMessageId }, msgByUserId: msgByUserId },
        { "$set": { seen: true } }
      );

      const conversationSender = await getConversation(user._id.toString());
      const conversationReceiver = await getConversation(msgByUserId);

      io.to(user._id.toString()).emit('conversation', conversationSender);
      io.to(msgByUserId).emit('conversation', conversationReceiver);
    } catch (error) {
      console.error('Error in seen handler:', error);
    }
  });

  socket.on('disconnect', () => {
    if (user && user._id) {
      onlineUsers.delete(user._id.toString());
      console.log('disconnect user ', socket.id);
      io.emit('onlineUser', Array.from(onlineUsers));
    }
  });
});

module.exports = {
  app,
  server
};
