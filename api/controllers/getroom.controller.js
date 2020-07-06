const room = require('../../src/entity/room')

exports.getRoom = function(req, res, next){    
    room.find({status: 1}, (err, rooms) => {
        if (err) return next(err);
        res.json({room: rooms})
    })
}