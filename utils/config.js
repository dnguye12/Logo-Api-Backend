/* eslint-disable no-undef */
require('dotenv').config()

const PORT = process.env.PORT
const MONGODB_URI = process.env.MONGODB_URI
const LOGO_API = process.env.LOGO_API
const SECRET = process.env.SECRET
const LOGO_API_2 = process.env.LOGO_API_2
const LOGO_API_2_KEY = process.env.LOGO_API_2_KEY
const LOGO_API_2_EMPTY = process.env.LOGO_API_2_EMPTY

module.exports = {
	MONGODB_URI,
	PORT,
	LOGO_API,
	SECRET,
	LOGO_API_2,
	LOGO_API_2_KEY,
	LOGO_API_2_EMPTY
}