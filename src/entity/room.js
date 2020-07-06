const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  room_name:{
     type: String,
     required: true 
  },
  status: {
    type: Number,
    required: true,
  },
  created_at:{
    type: Date
  },
  modified_at:{
    type: Date
  }
});

module.exports = mongoose.model('room', roomSchema);