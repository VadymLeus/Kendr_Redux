// backend/services/productVisibility.js
const withoutDigitalFile = ({ digital_file_url, ...product }) => product;

const visibleProducts = async (products, canManageSite) => {
    const decisions = new Map();
    const result = [];
    for (const product of products) {
        if (!decisions.has(product.site_id)) {
            decisions.set(product.site_id, await canManageSite(product.site_id));
        }
        result.push(decisions.get(product.site_id) ? product : withoutDigitalFile(product));
    }
    return result;
};

module.exports = { withoutDigitalFile, visibleProducts };
