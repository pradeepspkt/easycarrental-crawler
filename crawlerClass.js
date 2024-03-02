const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { asyncSleep } = require('modern-async')
const cheerio = require('cheerio');
const converter = require('json-2-csv');
const { generateCombinations } = require('./functions')
const fs = require('fs').promises;
require('dotenv').config();
puppeteer.use(StealthPlugin());

class PaginationCrawler {
    name = null;
    Selectors = null;
    MaxConcurrency = 1;
    PuppeteerSettings = {
        headless: false,
        generateCookies: false
    };

    BrowserInstance = null;
    ActivePage = null;
    URL = null;
    OutputOptions = {
        saveAsJSON: true,
        saveAsCSV: false
    }
    ConfigOptions = null

    /**
     * 
     * @param {Object} options.Selectors The name of the user.
     * @param {String} options.name name of the paginationCrawler instance
     * @param {Number} options.MaxConcurrency max concurrency for 
     * @param {Object} options.PuppeteerSettings Puppeteer configuration settings.
     * @param {Boolean | String} options.PuppeteerSettings.headless Defines Puppeteer headless behaviour.
     * @param {Boolean} options.PuppeteerSettings.generateCookies Generates cookies using puppeteer.
     * @param {String} options.URL Generates cookies using puppeteer.
     * @param {Object} options.OutputOptions Output options either to save as JSON/CSV
     * @param {Object} options.ConfigOptions Config options

     */
    constructor(options) {
        this.name = options.name
        this.Selectors = options.Selectors;
        this.PuppeteerSettings = {
            ...this.PuppeteerSettings,
            ...options.PuppeteerSettings
        };
        this.URL = options.URL

        if (options.OutputOptions) this.OutputOptions = {
            ...this.OutputOptions,
            ...options.OutputOptions
        }

        if (options.MaxConcurrency) this.MaxConcurrency = options.MaxConcurrency;
        if (options.ConfigOptions) this.ConfigOptions = options.ConfigOptions;

    }

    async initialize() {
        await this.generatePuppeteerBrowser();
    }

    async generatePuppeteerBrowser() {
        try {
            const browserOptions = { headless: this.PuppeteerSettings.headless };
            const BrowserInstance = await puppeteer.launch(browserOptions);
            this.BrowserInstance = BrowserInstance

            const ActivePage = await BrowserInstance.newPage();
            this.ActivePage = ActivePage

            await ActivePage.setDefaultNavigationTimeout(30000);
            await ActivePage.goto(this.URL);

            await this.retryOp(async () => {
                await ActivePage.waitForSelector(this.Selectors.acceptCookiesDialog);
                await asyncSleep(500);
                await ActivePage.waitForSelector(this.Selectors.cookieAccept);
                await ActivePage.click(this.Selectors.cookieAccept);
                await asyncSleep(500);

                await ActivePage.waitForSelector(this.Selectors.listElements);
                await asyncSleep(500);

            }, { operation: "accept cookies dialog" });

        } catch (error) {
            console.error("Error generating browser", error)
            throw error
        }
    }

    async run() {
        await this.crawlPaginatedList()
        if (this.BrowserInstance) {
            this.BrowserInstance.close()
        }
        console.log("Run finished")
    }

    async crawlPaginatedList() {
        let urls = await this.getURLs()
        const newRecords = []
        for (const url of urls) {
            const data = await this.crawlPage(url, this.Selectors);
            newRecords.push(data);
        }
        if (this.OutputOptions.saveAsCSV) await this.outputCsvFile(newRecords);
        if (this.OutputOptions.saveAsJSON) await this.outputJsonFile(newRecords);
    }

    async getURLs() {
        let page = 1
        const allUrls = []
        while (true) {
            const links = await this.ActivePage.$$eval(this.Selectors.listElements, anchors => {
                return anchors.map(anchor => anchor.href);
            });
            allUrls.push(...links)
            if (await this.ActivePage.$(this.Selectors.nextButton)) {
                await this.ActivePage.click(this.Selectors.nextButton)
                await this.waitForPageUpdate(this.Selectors.currentPage, page)
                page++
            } else {
                break;
            }
        }
        return allUrls
    }

    async waitForPageUpdate(selector, currentPage) {
        await this.ActivePage.waitForFunction(
            (selector, currentPage) => {
                const currentPageElement = document.querySelector(selector);
                return currentPageElement && parseInt(currentPageElement.getAttribute('data-value')) > currentPage;
            },
            { timeout: 30000 },
            selector,
            currentPage
        );
    }

    async crawlPage(url, selectors) {
        await this.ActivePage.goto(url, { waitUntil: 'networkidle0' })
        const html = await this.ActivePage.content();
        const $ = cheerio.load(html);
        const data = await this.individualListingParser($, selectors, url)
        return data
    }

    async individualListingParser($, selectors, url) {
        const noRedemptionPricedata = await this.individualPriceParser(selectors)
        const noRedemptionPriceWithTaxData = await this.individualPriceParser(selectors, true)
        const noRedemptionMergedData = await this.mergeArrays(noRedemptionPricedata, noRedemptionPriceWithTaxData);

        const redemptionPricedata = await this.individualPriceParser(selectors, false, true)
        const redemptionPriceWithTaxData = await this.individualPriceParser(selectors, true, true)
        const redemptionMergedData = await this.mergeArrays(redemptionPricedata, redemptionPriceWithTaxData, true);

        const data = {
            url,
            title: $(selectors?.title)?.text()?.trim(),
            condition: $(selectors?.condition)?.eq(0)?.text()?.trim(),
            bodyType: $(selectors?.bodyType)?.eq(3)?.text()?.trim(),
            fuelType: $(selectors?.fuelType)?.eq(4)?.text()?.trim(),
            boxType: $(selectors?.boxType)?.eq(5)?.text()?.trim(),
            fuelConsumption: $(selectors?.fuelConsumption)?.eq(1)?.text()?.trim(),
            co2: $(selectors?.co2)?.eq(2)?.text()?.trim(),
            power: $(selectors?.power)?.eq(3)?.text()?.trim(),
            engine: $(selectors?.engine)?.eq(4)?.text()?.trim(),
            doors: $(selectors?.doors)?.eq(5)?.text()?.trim(),
            gears: $(selectors?.gears)?.eq(6)?.text()?.trim(),
            description: $(selectors?.description)?.text()?.trim(),
            noRedemptionPriceData: noRedemptionMergedData,
            redemptionPricedata: redemptionMergedData,
        }
        return this.sanitizeEntry(data);
    }

    async individualPriceParser(selectors, vat = false, redemption = false) {
        const combinations = await this.createCombinations(redemption)
        const newRecords = []

        await this.ActivePage.evaluate((vat, redemption, selectors) => {
            if (vat) document.querySelector(selectors.vatbutton).click()
            if (
                redemption &&
                document.querySelector(selectors.acquisitionButton).getAttribute('class').includes('ignore')
            )
                document.querySelector(selectors.redemptionTab).click()
        }, vat, redemption, selectors)

        for (const combination of combinations) {

            let initialPriceValue = await this.ActivePage.$eval(selectors.price, element => element.value);

            await this.ActivePage.evaluate(async (duration, mileage, advancePayment, acquisition, redemption, selectors) => {
                const setElementValue = async (elementId, elementValue) => {
                    const element = document.getElementById(elementId);
                    if (element) {
                        element.value = elementValue;
                        element.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        console.error(`Element with ID '${elementId}' not found.`);
                    }
                };

                await setElementValue(selectors.duration, duration);
                await setElementValue(selectors.mileage, mileage)
                await setElementValue(selectors.advancePayment, advancePayment)
                if (redemption) {
                    await setElementValue(selectors.acquisitionValue, acquisition)
                }
            }, combination[0], combination[1], combination[2], combination[3], redemption, selectors)

            let afterUpdateValue = await this.ActivePage.$eval(selectors.price, element => element.value);

            const startTime = Date.now();
            while (initialPriceValue === afterUpdateValue) {
                if (Date.now() - startTime > 10000) {
                    console.log('Timeout reached. Exiting loop.');
                    break;
                }
                await asyncSleep(300)
                afterUpdateValue = await this.ActivePage.$eval(selectors.price, element => element.value);
            }

            const { finalPrice, advanceAmount, acquisitionValue } = await this.ActivePage.evaluate((selectors) => {
                const finalPrice = document.querySelector(selectors.price).value
                const advanceAmount = document.querySelector(selectors.advancePaymentValue).value
                const acquisitionValue = document.querySelector(selectors.acquisitionValueAmount).value || null
                return { finalPrice, advanceAmount, acquisitionValue }
            }, selectors)

            const data = {
                duration: `${combination[0]} months`,
                mileage: `${combination[1]} km`,
                advancePayment: combination[2]
            }
            if (redemption) {
                if (vat) data.acquisitionAmountWithVat = acquisitionValue
                else data.acquisitionAmountWithoutVat = acquisitionValue
                data.acquisition = combination[3]
            }
            if (vat) {
                data.priceWithVat = finalPrice
                data.advancePaymentWithVat = advanceAmount
            }
            else {
                data.priceWithoutVat = finalPrice
                data.advancePaymentWithoutVat = advanceAmount
            }

            console.log(`Fetched data for combination, duration ${data.duration}, mileage: ${data.mileage}, advanced payment: ${data.advancePaymentWithVat || data.advancePaymentWithoutVat}`)
            newRecords.push(data)
        }

        // Click on vat again to reset it to original after its done, so that it wont hamper our next run
        await this.ActivePage.evaluate((vat, selectors) => {
            if (vat) document.querySelector(selectors.vatbutton).click()
        }, vat, selectors)
        return newRecords
    }

    async createCombinations(redemption = false) {
        const durations = this.ConfigOptions.durations;
        const mileages = this.ConfigOptions.mileages;
        const advancePayments = this.ConfigOptions.advancePayments;
        const acquisition = this.ConfigOptions.acquisition;

        // Generate combinations
        let combinations;
        if (redemption) combinations = generateCombinations([durations, mileages, advancePayments, acquisition]);
        else combinations = generateCombinations([durations, mileages, advancePayments]);
        return combinations
    }

    async mergeArrays(firstArray, secondArray, redemption = false) {
        const mergedArray = [];
        const restructuredData = [];

        firstArray.forEach(firstItem => {
            let matchingSecondItem;

            if (redemption) {
                matchingSecondItem = secondArray.find(secondItem =>
                    secondItem.duration === firstItem.duration &&
                    secondItem.mileage === firstItem.mileage &&
                    secondItem.advancePayment === firstItem.advancePayment &&
                    secondItem.acquisition === firstItem.acquisition
                );
            } else {
                matchingSecondItem = secondArray.find(secondItem =>
                    secondItem.duration === firstItem.duration &&
                    secondItem.mileage === firstItem.mileage &&
                    secondItem.advancePayment === firstItem.advancePayment
                );
            }

            if (matchingSecondItem) {
                mergedArray.push(Object.assign({}, firstItem, matchingSecondItem));

                const { duration, mileage } = firstItem;
                const key = `${duration}_${mileage}`;

                const newData = {
                    metrics: {
                        duration,
                        mileage,
                        advancePayment: matchingSecondItem.advancePayment,
                        acquisition: matchingSecondItem.acquisition
                    },
                    withoutVAT: {
                        price: firstItem.priceWithoutVat,
                        advancePayment: firstItem.advancePaymentWithoutVat,
                        acquisitionAmount: firstItem.acquisitionAmountWithoutVat
                    },
                    VAT: {
                        price: matchingSecondItem.priceWithVat,
                        advancePayment: matchingSecondItem.advancePaymentWithVat,
                        acquisitionAmount: matchingSecondItem.acquisitionAmountWithVat
                    },

                };

                restructuredData.push(newData);
            }
        });

        return restructuredData;
    }

    sanitizeEntry(data) {
        const sanitizedData = { ...data };
        for (const [name, value] of Object.entries(data)) {
            if (typeof value === 'string') {
                sanitizedData[name] = value?.trim().replaceAll(',', '').replaceAll('\n', '').replaceAll('\n', '') || '';
            }
            if (typeof value === 'undefined') {
                sanitizedData[name] = '';
            }
        }
        return sanitizedData
    }

    async outputCsvFile(json) {
        if (!json.length) return;
        const csvPath = this.genPath('csv');

        const fileName = `${csvPath}/${new Date().getTime()}.csv`
        await fs.mkdir(csvPath, { recursive: true });
        const csv = converter.json2csv(json);
        await fs.writeFile(fileName, csv);
        console.log(`Saved CSV to ${csvPath} with filename: ${fileName}`)
    }

    async outputJsonFile(json) {
        if (!json.length) return;
        const jsonPath = this.genPath('json');

        const fileName = `${jsonPath}/${new Date().getTime()}.json`
        await fs.mkdir(jsonPath, { recursive: true });
        await fs.writeFile(fileName, JSON.stringify(json, null, 2));
        console.log(`Saved JSON to ${jsonPath} with filename: ${fileName}`)
    }

    genPath(category) {
        let path = `cars/${this.name}/${category}/`;
        path += `${new Date().getFullYear()}/${new Date().getMonth() + 1}/${new Date().getDate()}/`;
        console.log(`Generated path ${path}`)
        return path;
    }

    /**
     * retryOp will run the input function (fn) until it is successful. It will error out if it
     * reaches maxRetries amount of retries.
     *
     * @param {Function} fn the function that needs to be retried.
     * @param {Object} options includes the operation name (for logging) & the maximum amount of retries
     * allowed (defaults to 10).
     */
    async retryOp(fn, options = {}) {
        const { operation = 'UNKNOWN', maxRetries = 16 } = options;
        let currentRetry = 0;

        const fnWrapper = async () => {
            if (currentRetry !== 0) {
                console.log(`Retrying operation "${operation}"... ${currentRetry}/${maxRetries}`);
            }

            try {
                const result = await fn();
                return result;
            } catch (error) {
                if (currentRetry > maxRetries) {
                    console.error(error);
                    throw error;
                }
                currentRetry = currentRetry + 1;
                return fnWrapper();
            }
        }
        return fnWrapper();
    }
}

module.exports = PaginationCrawler;
