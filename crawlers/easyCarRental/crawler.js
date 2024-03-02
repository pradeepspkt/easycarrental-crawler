const PaginationCrawler = require('../../crawlerClass');
const ecrSelectors = require('./selectors')


async function easyCarRentalCrawler() {
    const ECRCrawler = new PaginationCrawler({
        Selectors: ecrSelectors,
        name: 'easyCarRental',
        MaxConcurrency: 1,
        CronSettings: "* */24 * * *", //set to run each 24h
        PuppeteerSettings: {
            headless: false,
        },
        URL: 'https://www.easyrental.gr/leasing/prosfores-kainouria/',
        ConfigOptions: {
            durations: [24, 36, 48, 60],
            mileages: [15000, 20000, 25000, 30000, 35000, 40000],
            advancePayments: [0, 5, 10, 15, 20, 25, 30, 35, 40],
            acquisition: [0, 5, 10, 15, 20, 25, 30, 35]
        }
    });

    await ECRCrawler.initialize();
    await ECRCrawler.run();

}

easyCarRentalCrawler()

module.exports = easyCarRentalCrawler
