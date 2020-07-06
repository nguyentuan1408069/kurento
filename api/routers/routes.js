const express = require('express')
const router = express.Router()
const {getRoom} = require('../controllers/getroom.controller')

router.get('/getroom', getRoom)

module.exports = router;