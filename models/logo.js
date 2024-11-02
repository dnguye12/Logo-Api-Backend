const mongoose = require('mongoose')
const uniqueValidator = require('mongoose-unique-validator')

const LogoSchema = new mongoose.Schema({
    names: {
        type: [String],
        required: true,
        index: true
    },
    ticker: {
        type: String,
        unique: true,
        required: true,
        index: true
    },
    websites: {
        type: [String],
        required: true,
        index: true,
        validate: {
            validator: function (webs) {
                return webs.length > 0;
            },
            message: 'A company must have at least one website.'
        }
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