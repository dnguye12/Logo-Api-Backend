const axios = require('axios');
const logoRouter = require('express').Router();
const config = require("../utils/config");
const Logo = require('../models/logo');
const { default: yahooFinance } = require('yahoo-finance2');
const fs = require('fs')
const { PNG } = require('pngjs')
const sharp = require('sharp')
const path = require('path')
const { parse } = require('tldjs')

const placeholderImagePath = path.join(__dirname, '../utils/logo-api.png')
const placeholderImageBuffer = fs.readFileSync(placeholderImagePath)
let placeholderPng = PNG.sync.read(placeholderImageBuffer);

// Utility function for structured error response
const handleErrorResponse = (res, statusCode, message, details = null) => {
    console.error(details || message); // Log detailed error if provided
    return res.status(statusCode).json({ error: message });
};

const isEmpty = async (inputBuffer) => {
    try {
        const resizedInputBuffer = await sharp(inputBuffer).resize(400, 400).png().toBuffer();
        const inputPNG = PNG.sync.read(resizedInputBuffer);

        const pixelmatch = (await import('pixelmatch')).default;
        const diffPixels = pixelmatch(inputPNG.data, placeholderPng.data, null, 400, 400, { threshold: 0.1 });

        const totalPixels = inputPNG.width * inputPNG.height;
        const diffPercentage = diffPixels / totalPixels;
        return diffPercentage < 0.05;
    } catch (error) {
        console.error('Error comparing images:', error);
        return false;
    }
};

logoRouter.get('/', async (req, res) => {
    let { ticker, name, url, secret } = req.query;

    if (secret && secret == config.SECRET) {
        try {
            let logo = await Logo.findOne({ names: name.toLowerCase() })
            if (logo) {
                const base64 = logo.logo.toString('base64')
                return res.json(base64)
            }
        } catch (error) {
            console.log(error)
        }
    }

    if (!ticker && !name && !url) {
        return handleErrorResponse(res, 400, 'Missing input parameter.');
    }

    if (ticker) {
        try {
            // Check if logo exists in the database
            let logo = await Logo.findOne({ ticker });
            if (logo) {
                // If found, return logo as base64 string
                const imageBuffer = Buffer.from(logo.logo, 'base64');
                res.setHeader('Content-Type', 'image/png');
                return res.send(imageBuffer);
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
                return handleErrorResponse(res, 400, `Unable to retrieve logo image for ticker: ${ticker}.`, error);
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
                return handleErrorResponse(res, 400, 'Database error while saving logo.', error);
            }

            if (logo) {
                const imageBuffer = Buffer.from(logo.logo, 'base64');
                res.setHeader('Content-Type', 'image/png');
                return res.send(imageBuffer);
            }

        } catch (error) {
            return handleErrorResponse(res, 400, 'Unexpected server error.', error);
        }
    }

    if (url) {
        const urlParsed = parse(url)

        if (!urlParsed || !urlParsed.isValid) {
            return handleErrorResponse(res, 400, 'Invalid website URL parameter.');
        }

        const urlDomain = urlParsed.domain

        try {
            let logo = await Logo.findOne({ websites: urlDomain })
            if (logo) {
                const imageBuffer = Buffer.from(logo.logo, 'base64');
                res.setHeader('Content-Type', 'image/png');
                return res.send(imageBuffer);
            }

            // Attempt to find the company ticker using Yahoo Finance or other APIs
            let ticker;
            let helper;
            let logoBuffer;

            helper = urlDomain.split('.')

            try {
                const result = await axios.get(`${config.LOGO_API_2}${urlDomain}/icon?c=${config.LOGO_API_2_KEY}`, { responseType: 'arraybuffer' })
                logoBuffer = Buffer.from(result.data, 'binary')
                if (logoBuffer && !(await isEmpty(logoBuffer))) {
                    
                    const newLogo = new Logo({
                        ticker: helper[0],
                        names: [helper[0]],
                        websites: [`${urlDomain}`],
                        logo: logoBuffer
                    })
                    logo = await newLogo.save();
                    if (logo) {
                        const imageBuffer = Buffer.from(logo.logo, 'base64');
                        res.setHeader('Content-Type', 'image/png');
                        return res.send(imageBuffer);
                    }
                }
            } catch (error) {
                console.log(error)
                return handleErrorResponse(res, 400, 'No brand found for this name.');
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
                return handleErrorResponse(res, 400, 'Unable to find a matching ticker for the provided website.', error);
            }

            // If ticker is found, proceed to retrieve the logo
            if (ticker) {
                const logoUrl = `${config.LOGO_API}${ticker}.png`;
                logoBuffer = null;
                try {
                    const result = await axios.get(logoUrl, { responseType: 'arraybuffer' });
                    logoBuffer = Buffer.from(result.data, 'binary');
                } catch (error) {
                    return handleErrorResponse(res, 400, `Unable to retrieve logo image for website: ${urlDomain}.`, error);
                }

                // Check if a logo with this ticker already exists to update it with the new website
                let existingLogo = await Logo.findOne({ ticker });
                if (existingLogo) {
                    // Update the document by adding the new website to the `websites` array
                    existingLogo.websites.push(urlDomain);
                    await existingLogo.save();
                    logo = existingLogo;
                } else {
                    // If no existing entry, create a new document with the website list
                    const newLogo = new Logo({ ticker, names: [helper], websites: [urlDomain], logo: logoBuffer });
                    logo = await newLogo.save();
                }

                if (logo) {
                    const imageBuffer = Buffer.from(logo.logo, 'base64');
                    res.setHeader('Content-Type', 'image/png');
                    return res.send(imageBuffer);
                }
            } else {
                return handleErrorResponse(res, 400, 'No ticker found for the provided website.');
            }

        } catch (error) {
            return handleErrorResponse(res, 400, 'Unexpected server error.', error);
        }
    }

    if (name) {
        try {
            let logo = await Logo.findOne({ names: name.toLowerCase() })
            if (logo) {
                const imageBuffer = Buffer.from(logo.logo, 'base64');
                res.setHeader('Content-Type', 'image/png');
                return res.send(imageBuffer);
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
                return handleErrorResponse(res, 400, 'Unable to find a matching ticker for the provided website.', error);
            }

            // If ticker is found, proceed to retrieve the logo
            if (ticker) {
                const logoUrl = `${config.LOGO_API}${ticker}.png`;
                let logoBuffer;
                try {
                    const result = await axios.get(logoUrl, { responseType: 'arraybuffer' });
                    logoBuffer = Buffer.from(result.data, 'binary');
                } catch (error) {
                    return handleErrorResponse(res, 400, `Unable to retrieve logo image for website: ${url}.`, error);
                }

                // Check if a logo with this ticker already exists to update it with the new website
                let existingLogo = await Logo.findOne({ ticker });
                if (existingLogo) {
                    // Update the document by adding the new website to the `websites` array
                    existingLogo.names.push(name);
                    await existingLogo.save();
                    logo = existingLogo;
                } else {
                    // If no existing entry, create a new document with the website list

                    const newLogo = new Logo({ ticker, names: [name], websites: [parse(`${name}.com`).domain], logo: logoBuffer });
                    logo = await newLogo.save();
                }

                if (logo) {
                    const imageBuffer = Buffer.from(logo.logo, 'base64');
                    res.setHeader('Content-Type', 'image/png');
                    return res.send(imageBuffer);
                }
            } else {
                const newUrl = parse(`${name}.com`)
                let logoBuffer
                if (newUrl.isValid) {
                    try {
                        const result = await axios.get(`${config.LOGO_API_2}${newUrl.domain}/icon?c=${config.LOGO_API_2_KEY}`, { responseType: 'arraybuffer' })
                        logoBuffer = Buffer.from(result.data, 'binary')

                        if (logoBuffer && !isEmpty(logoBuffer)) {
                            const newLogo = new Logo({
                                ticker: name,
                                names: [name],
                                websites: [newUrl.domain],
                                logo: logoBuffer
                            })
                            logo = await newLogo.save();
                            if (logo) {
                                const imageBuffer = Buffer.from(logo.logo, 'base64');
                                res.setHeader('Content-Type', 'image/png');
                                return res.send(imageBuffer);
                            }
                        }

                        if (!logo) {
                            return handleErrorResponse(res, 400, 'No brand found for this name.');
                        }
                    } catch (error) {
                        return handleErrorResponse(res, 400, 'No brand found for this name.');
                    }
                }else {

                }

            }
        } catch (error) {
            return handleErrorResponse(res, 400, 'Unexpected server error.', error);
        }
    }
});

logoRouter.post('/', async (req, res) => {
    const { secret, names, ticker, websites, logo } = req.body

    if (!secret || secret != config.SECRET) {
        return handleErrorResponse(res, 400, 'No permission.');
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
        return handleErrorResponse(res, 400, 'Error saving new logo to the database.', error);
    }

})

module.exports = logoRouter;