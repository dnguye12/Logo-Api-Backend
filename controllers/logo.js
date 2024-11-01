const axios = require('axios');
const logoRouter = require('express').Router();
const Logo = require('../models/logo');
const { default: yahooFinance } = require('yahoo-finance2');

// Utility function for structured error response
const handleErrorResponse = (res, statusCode, message, details = null) => {
    console.error(details || message); // Log detailed error if provided
    return res.status(statusCode).json({ error: message });
};

logoRouter.get('/ticker/:ticker', async (req, res) => {
    const { ticker } = req.params;

    if (!ticker) {
        return handleErrorResponse(res, 400, 'Missing ticker parameter.');
    }

    try {
        // Check if logo exists in the database
        let logo = await Logo.findOne({ ticker });
        if (logo) {
            // If found, return logo as base64 string
            const base64Logo = logo.logo.toString('base64');
            return res.json(base64Logo);
        }

        // Fetch data from Yahoo Finance if logo is not in database
        let quoteSummary;
        try {
            quoteSummary = await yahooFinance.quoteSummary(ticker, { modules: ['summaryProfile'] });
        } catch (error) {
            return handleErrorResponse(res, 400, 'Invalid ticker symbol.', error);
        }

        const website = quoteSummary?.summaryProfile?.website || '';

        // Fetch logo image from Financial Modeling Prep API
        const logoUrl = `https://financialmodelingprep.com/image-stock/${ticker}.png`;
        let logoBuffer;
        try {
            const result = await axios.get(logoUrl, { responseType: 'arraybuffer' });
            logoBuffer = Buffer.from(result.data, 'binary');
        } catch (error) {
            return handleErrorResponse(res, 502, `Unable to retrieve logo image for ticker: ${ticker}.`, error);
        }

        // Save new logo to the database
        const newLogo = new Logo({ ticker, website, logo: logoBuffer });
        try {
            logo = await newLogo.save();
        } catch (error) {
            return handleErrorResponse(res, 500, 'Database error while saving logo.', error);
        }

        // Return the newly saved logo as a base64 string
        const base64Logo = logo.logo.toString('base64');
        res.json(base64Logo);

    } catch (error) {
        return handleErrorResponse(res, 500, 'Unexpected server error.', error);
    }
});

module.exports = logoRouter;
