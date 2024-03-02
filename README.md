## Easy car rental crawling.

### Installation

To install the necessary dependencies, run:

```
npm install
```

### Usage

To run the crawler and extract leasing cars from the website, use the following command:

```
npm run crawl:ecr
```

The output can be found in the newly created `cars` folder.

### Configuration

The crawler is highly configurable. You can customize search combinations by modifying the following options in crawlers/crawler.js:

```
ConfigOptions: {
    durations: [24, 36, 48, 60],
    mileages: [15000, 20000, 25000, 30000, 35000, 40000],
    advancePayments: [0, 5, 10, 15, 20, 25, 30, 35, 40],
    acquisition: [0, 5, 10, 15, 20, 25, 30, 35]
},
```

For testing purposes, you can adjust these options to have fewer combinations.

### Output Options

You can customize the output format using the following options in crawler.js:

```
OutputOptions: {
    saveAsJSON: true,
    saveAsCSV: false
}
```
Set `saveAsJSON` to `true` if you want to save the output as JSON, and `saveAsCSV` to `true` if you want to save it as CSV.

Additionally if you want some specific numbers of cars to scrape, Suppose for testing purpose you want to crawl only one car data. Then put this value to 1
if its CrawlNumberOfItems: null then it will crawl every cars available on the website.
```
CrawlNumberOfItems: 1
```

NOTE: For data to be saved, CSV and JSON, all data must be crawled. The output files can be seen under folder cars.
