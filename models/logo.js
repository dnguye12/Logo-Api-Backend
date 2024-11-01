const mongoose = require('mongoose')
const uniqueValidator = require('mongoose-unique-validator')

const LogoSchema = new mongoose.Schema({
    ticker: {
        type: String,
        unique: true,
        required: true,
        index: true
    },
    website: {
        type: String,
        required: true,
        index: true
    },
    logo: {
        type: Buffer,
        required: true
    }
})

LogoSchema.index({
    ticker: 1, 
    website: 1
})

LogoSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString()
        delete returnedObject._id
        delete returnedObject.__v
    }
})

LogoSchema.plugin(uniqueValidator);

module.exports = mongoose.model('Logo', LogoSchema)