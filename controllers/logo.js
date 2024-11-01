const axios = require('axios');
const logoRouter = require('express').Router();
const Logo = require('../models/logo');
const { default: yahooFinance } = require('yahoo-finance2');

// Utility function for structured error response
const handleErrorResponse = (res, statusCode, message, details = null) => {
    console.error(details || message); // Log detailed error if provided
    return res.status(statusCode).json({ error: message });
};

// Helper function to validate and format URL
const formatUrl = (url) => {
    // If the protocol is missing, add http:// by default
    if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
    }
    return url;
};

const isValidUrl = (url) => {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

logoRouter.get('/ticker', async (req, res) => {
    const { ticker } = req.query;

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
        const newLogo = new Logo({
            ticker,
            websites: [website],
            logo: logoBuffer
        });
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

logoRouter.get('/website', async (req, res) => {
    let { url } = req.query

    if (!url) {
        return handleErrorResponse(res, 400, 'Missing website URL parameter.');
    }

    url = formatUrl(url);

    if (!isValidUrl(url)) {
        return handleErrorResponse(res, 400, 'Invalid website URL parameter.');
    }

    try {
        // Check if any logo entry has this website in its websites array
        let logo = await Logo.findOne({ websites: url });
        if (logo) {
            const base64Logo = logo.logo.toString('base64');
            return res.json(base64Logo);
        }

        // Attempt to find the company ticker using Yahoo Finance or other APIs
        let ticker;
        try {
            const helper = url.split('.')[1]

            const result = await yahooFinance.search(helper, {
                newsCount: 0,
            });
            if (result && result.quotes && result.quotes.length > 0) {
                ticker = result.quotes[0].symbol
            }
        } catch (error) {
            return handleErrorResponse(res, 404, 'Unable to find a matching ticker for the provided website.', error);
        }

        // If ticker is found, proceed to retrieve the logo
        if (ticker) {
            const logoUrl = `https://financialmodelingprep.com/image-stock/${ticker}.png`;
            let logoBuffer;
            try {
                const result = await axios.get(logoUrl, { responseType: 'arraybuffer' });
                logoBuffer = Buffer.from(result.data, 'binary');
            } catch (error) {
                return handleErrorResponse(res, 502, `Unable to retrieve logo image for website: ${url}.`, error);
            }

            // Check if a logo with this ticker already exists to update it with the new website
            let existingLogo = await Logo.findOne({ ticker });
            if (existingLogo) {
                // Update the document by adding the new website to the `websites` array
                existingLogo.websites.push(url);
                await existingLogo.save();
                logo = existingLogo;
            } else {
                // If no existing entry, create a new document with the website list
                const newLogo = new Logo({ ticker, websites: [url], logo: logoBuffer });
                logo = await newLogo.save();
            }

            // Return the logo as a base64 string
            const base64Logo = logo.logo.toString('base64');
            res.json(base64Logo);
        } else {
            return handleErrorResponse(res, 404, 'No ticker found for the provided website.');
        }

    } catch (error) {
        return handleErrorResponse(res, 500, 'Unexpected server error.', error);
    }
})

module.exports = logoRouter;