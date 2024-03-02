const generateCombinations = (arrays) => {
    const result = [];
    const maxIndex = arrays.length - 1;

    function generate(currentIndex, combination) {
        if (currentIndex === maxIndex) {
            arrays[currentIndex].forEach((value) => {
                result.push([...combination, value]);
            });
        } else {
            arrays[currentIndex].forEach((value) => {
                generate(currentIndex + 1, [...combination, value]);
            });
        }
    }

    generate(0, []);

    return result;
}

module.exports = { generateCombinations }