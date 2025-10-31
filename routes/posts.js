const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const Post = require('../models/Post');
const auth = require('../middleware/auth');

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => ({
    folder: 'social-app',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'mp4', 'webm', 'ogg', 'mov'],
    transformation: file.mimetype && file.mimetype.startsWith('image/')
      ? [{ width: 800, height: 600, crop: 'limit' }]
      : []
  })
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

router.post('/', auth, async (req, res) => {
  upload.single('image')(req, res, async (uploadErr) => {
    if (uploadErr) {
      const statusCode = uploadErr.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      console.error('Image upload error:', uploadErr);
      return res.status(statusCode).json({ 
        message: uploadErr.message || 'Image upload failed' 
      });
    }

    try {
      const { text } = req.body;
      const isVideo = req.file && req.file.mimetype && req.file.mimetype.startsWith('video/');
      const image = req.file && !isVideo ? req.file.path : '';
      const imagePublicId = req.file && !isVideo ? req.file.filename : '';
      const video = req.file && isVideo ? req.file.path : '';
      const videoPublicId = req.file && isVideo ? req.file.filename : '';

      if (!text && !image && !video) {
        return res.status(400).json({ 
          message: 'Post must contain text, image, or video' 
        });
      }

      const post = new Post({
        user: req.user._id,
        username: req.user.username,
        text: text || '',
        image: image,
        imagePublicId: imagePublicId,
        video: video,
        videoPublicId: videoPublicId
      });

      await post.save();

      return res.status(201).json({
        message: 'Post created successfully',
        post
      });
    } catch (error) {
      console.error('Create post error:', error.message);
      console.error('Full error:', error);
      return res.status(500).json({ message: 'Server error creating post', error: error.message });
    }
  });
});

router.get('/', async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate('user', 'username')
      .limit(50);

    res.json({ posts });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ message: 'Server error fetching posts' });
  }
});

router.post('/:id/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const likeIndex = post.likes.findIndex(
      like => like.user.toString() === req.user._id.toString()
    );

    if (likeIndex > -1) {
      post.likes.splice(likeIndex, 1);
      post.likesCount = post.likes.length;
    } else {
      post.likes.push({
        user: req.user._id,
        username: req.user.username
      });
      post.likesCount = post.likes.length;
    }

    await post.save();

    res.json({
      message: likeIndex > -1 ? 'Post unliked' : 'Post liked',
      likesCount: post.likesCount,
      isLiked: likeIndex === -1
    });
  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ message: 'Server error liking post' });
  }
});

router.post('/:id/comment', auth, async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || text.trim() === '') {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const newComment = {
      user: req.user._id,
      username: req.user.username,
      text: text.trim()
    };

    post.comments.push(newComment);
    post.commentsCount = post.comments.length;

    await post.save();

    const savedComment = post.comments[post.comments.length - 1];

    res.status(201).json({
      message: 'Comment added successfully',
      comment: savedComment,
      commentsCount: post.commentsCount
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ message: 'Server error adding comment' });
  }
});

router.get('/:id/comments', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).select('comments');
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    res.json({ comments: post.comments });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ message: 'Server error fetching comments' });
  }
});

module.exports = router;