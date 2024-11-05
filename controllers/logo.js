const axios = require('axios');
const logoRouter = require('express').Router();
const config = require("../utils/config");
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

    let formattedUrl = new URL(url);

    if (!formattedUrl.hostname.startsWith('www.')) {
        formattedUrl.hostname = `www.${formattedUrl.hostname}`;
    }

    // Remove trailing slash if present
    formattedUrl = formattedUrl.toString().replace(/\/+$/, '');

    return formattedUrl;
};

const isValidUrl = (url) => {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

const isEmpty = (input) => {
    return input.toString('base64') === config.LOGO_API_2_EMPTY
}

logoRouter.get('/', async (req, res) => {
    let { ticker, name, url } = req.query;

    if (!ticker && !name && !url) {
        return handleErrorResponse(res, 400, 'Missing input parameter.');
    }

    if (ticker) {
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

            const logoUrl = `${config.LOGO_API}${ticker}.png`;
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
    }

    if (url) {
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
            let helper;

            helper = url.split('.')
            const newUrl = helper[1] + '.' + helper[2]
            let logoBuffer
            try {
                const result = await axios.get(`${config.LOGO_API_2}${newUrl}/icon?c=${config.LOGO_API_2_KEY}`, { responseType: 'arraybuffer' })
                logoBuffer = Buffer.from(result.data, 'binary')

                if (logoBuffer && !isEmpty(logoBuffer)) {
                    const newLogo = new Logo({
                        ticker: helper[1],
                        names: [helper[1]],
                        websites: [newUrl],
                        logo: logoBuffer
                    })
                    logo = await newLogo.save();
                    const base64Logo = logo.logo.toString('base64');
                    res.json(base64Logo);
                }
            } catch (error) {
                return handleErrorResponse(res, 404, 'No brand found for this name.');
            }

            try {
                helper = helper[1]

                const result = await yahooFinance.search(helper, {
                    newsCount: 0,
                });

                if (result && result.quotes && result.quotes.length > 0) {

                    for (let i = 0; i < result.quotes.length; i++) {
                        if (!result.index || result.index !== "quotes") {
                            continue
                        }
                        else if (!result.quoteType || result.quoteType.toLowerCase() !== 'equity') {
                            continue
                        } else {
                            ticker = result.quotes[i].symbol
                            break
                        }
                    }
                }
            } catch (error) {
                return handleErrorResponse(res, 404, 'Unable to find a matching ticker for the provided website.', error);
            }

            // If ticker is found, proceed to retrieve the logo
            if (ticker) {
                const logoUrl = `${config.LOGO_API}${ticker}.png`;
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
                    const newLogo = new Logo({ ticker, names: [helper], websites: [url], logo: logoBuffer });
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
    }

    if (name) {
        try {
            let logo = await Logo.findOne({ names: name.toLowerCase() })
            if (logo) {
                const base64Logo = logo.logo.toString('base64');
                return res.json(base64Logo);
            }

            let ticker;
            try {

                const result = await yahooFinance.search(name, {
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
                const logoUrl = `${config.LOGO_API}${ticker}.png`;
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
                    const newLogo = new Logo({ ticker, names: [name], websites: [`https://www.${name}.com`], logo: logoBuffer });
                    logo = await newLogo.save();
                }

                // Return the logo as a base64 string
                const base64Logo = logo.logo.toString('base64');
                res.json(base64Logo);
            } else {
                const newUrl = `${name}.com`
                let logoBuffer
                try {
                    const result = await axios.get(`${config.LOGO_API_2}${newUrl}/icon?c=${config.LOGO_API_2_KEY}`, { responseType: 'arraybuffer' })
                    logoBuffer = Buffer.from(result.data, 'binary')

                    if (logoBuffer && !isEmpty(logoBuffer)) {
                        const newLogo = new Logo({
                            ticker: name,
                            names: [name],
                            websites: [`https://www.${name}.com`],
                            logo: logoBuffer
                        })
                        logo = await newLogo.save();
                        const base64Logo = logo.logo.toString('base64');
                        res.json(base64Logo);
                    }

                    if (!logo) {
                        return handleErrorResponse(res, 404, 'No brand found for this name.');
                    }
                } catch (error) {
                    return handleErrorResponse(res, 404, 'No brand found for this name.');
                }

            }
        } catch (error) {
            return handleErrorResponse(res, 500, 'Unexpected server error.', error);
        }
    }
});

logoRouter.post('/', async (req, res) => {
    const { secret, names, ticker, websites, logo } = req.body

    if (!secret || secret != config.SECRET) {
        return handleErrorResponse(res, 404, 'No permission.');
    }

    if (!names || !ticker || !websites || !logo) {
        return handleErrorResponse(res, 400, 'Missing required fields.');
    }

    let logoBuffer;
    try {
        logoBuffer = Buffer.from(logo, 'base64');
    } catch (error) {
        return handleErrorResponse(res, 400, 'Invalid logo format. Please provide a base64 encoded string.', error);
    }

    const newLogo = new Logo({
        names,
        ticker,
        websites,
        logo: logoBuffer
    })

    try {
        const savedLogo = await newLogo.save();
        res.status(201).json(savedLogo);
    } catch (error) {
        return handleErrorResponse(res, 500, 'Error saving new logo to the database.', error);
    }

})

module.exports = logoRouter;