const PaginationCrawler = require('../../crawlerClass');
const ecrSelectors = require('./selectors')


async function easyCarRentalCrawler() {
    const ECRCrawler = new PaginationCrawler({
        Selectors: ecrSelectors,
        name: 'easyCarRental-leasing',
        PuppeteerSettings: {
            headless: "new",
        },
        URL: 'https://www.easyrental.gr/leasing/prosfores-kainouria/',
        ConfigOptions: {
            durations: [24, 36, 48, 60],
            mileages: [15000, 20000, 25000, 30000, 35000, 40000],
            advancePayments: [0, 5, 10, 15, 20, 25, 30, 35, 40],
            acquisition: [0, 5, 10, 15, 20, 25, 30, 35]
        },
        OutputOptions: {
            saveAsJSON: true,
            saveAsCSV: true
        },
        // You can define any specific number of cars to crawl here, put the value to null if you want all cars to be scraped.
        CrawlNumberOfItems: null
    });

    await ECRCrawler.initialize();
    await ECRCrawler.run();

}

easyCarRentalCrawler()

module.exports = easyCarRentalCrawler
