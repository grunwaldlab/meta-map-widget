const VIRIDIS = ['#440154', '#482777', '#3f4a8a', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];
/**
 * Scale for mapping continuous numeric values to sizes
 */
export class ContinuousSizeScale {
    constructor(dataMin, dataMax, sizeMin, sizeMax) {
        this.dataMin = dataMin;
        this.dataMax = dataMax;
        this.sizeMin = sizeMin;
        this.sizeMax = sizeMax;
    }

    /**
     * Get the size corresponding to the given value
     * @param {number} value - The data value to map
     * @returns {number} The corresponding size, clamped to min/max
     */
    getValue(value) {
        // Clamp value to data range
        const clampedValue = Math.max(this.dataMin, Math.min(this.dataMax, value));

        // Handle edge case where dataMin === dataMax
        if (this.dataMin === this.dataMax) {
            if (value === this.dataMax) {
                return (this.sizeMin + this.sizeMax) / 2;
            } else if (value < this.dataMin) {
                return this.sizeMin
            } else {
                return this.sizeMax;
            }
        }

        // Linear interpolation
        const t = (clampedValue - this.dataMin) / (this.dataMax - this.dataMin);
        return this.sizeMin + t * (this.sizeMax - this.sizeMin);
    }
}

/**
 * Scale for mapping continuous numeric values to colors
 */
export class ContinuousColorScale {
    constructor(dataMin, dataMax, transformMin = 0, transformMax = 1, colors = null, colorPositions = null) {
        this.dataMin = dataMin;
        this.dataMax = dataMax;
        this.transformMin = transformMin;
        this.transformMax = transformMax;
        this.nullColor = "#808080"; // Default grey for null/empty values

        // Default to viridis-like color scheme if not provided
        if (colors === null) {
            this.colorsHex = VIRIDIS;
        } else {
            if (colors.length < 1) {
                throw new Error('At least 1 color is required');
            }
            this.colorsHex = colors;
        }
        this.colors = this.colorsHex.map(c => this._hexToRgb(c));

        // Handle single color case
        if (this.colors.length === 1) {
            this.colorPositions = [0];
            return;
        }

        // Default to equally spaced positions if not provided
        if (colorPositions === null) {
            this.colorPositions = this.colors.map((_, i) => i / (this.colors.length - 1));
        } else {
            if (colorPositions.length !== this.colors.length) {
                throw new Error('colorPositions must have the same length as colors');
            }

            // Sort colorPositions and reorder colors to match
            const paired = colorPositions.map((pos, i) => ({ pos, color: this.colors[i] }));
            paired.sort((a, b) => a.pos - b.pos);

            this.colorPositions = paired.map(p => p.pos);
            this.colors = paired.map(p => p.color);

            // Normalize positions to [0, 1] range
            const minPos = this.colorPositions[0];
            const maxPos = this.colorPositions[this.colorPositions.length - 1];

            if (minPos === maxPos) {
                // All positions are the same, normalize to 0
                this.colorPositions = this.colorPositions.map(() => 0);
            } else {
                this.colorPositions = this.colorPositions.map(pos => (pos - minPos) / (maxPos - minPos));
            }
        }
    }

    /**
     * Get the color corresponding to the given value
     * @param {number} value - The data value to map
     * @returns {string} The corresponding color as a hex string
     */
    getValue(value) {
        // Handle null/undefined/empty values
        if (value === null || value === undefined || value === '') {
            return this.nullColor;
        }

        // Handle single color case
        if (this.colors.length === 1) {
            return this._rgbToHex(this.colors[0].r, this.colors[0].g, this.colors[0].b);
        }

        // Handle edge case where dataMin === dataMax
        if (this.dataMin === this.dataMax) {
            if (value < this.dataMin) {
                return this._rgbToHex(this.colors[0].r, this.colors[0].g, this.colors[0].b);
            } else if (value > this.dataMax) {
                const lastColor = this.colors[this.colors.length - 1];
                return this._rgbToHex(lastColor.r, lastColor.g, lastColor.b);
            } else {
                // value === dataMin === dataMax, return middle color
                const midIdx = Math.floor(this.colors.length / 2);
                const midColor = this.colors[midIdx];
                return this._rgbToHex(midColor.r, midColor.g, midColor.b);
            }
        }

        // Clamp value to data range
        const clampedValue = Math.max(this.dataMin, Math.min(this.dataMax, value));

        // Map to [0, 1] range
        const dataT = (clampedValue - this.dataMin) / (this.dataMax - this.dataMin);

        // Transform to [transformMin, transformMax] range
        const transformedT = this.transformMin + dataT * (this.transformMax - this.transformMin);

        // Clamp to [0, 1] and handle values outside colorPositions range
        const clampedT = Math.max(0, Math.min(1, transformedT));

        // If transformedT is below the first position, return first color
        if (clampedT <= this.colorPositions[0]) {
            return this._rgbToHex(this.colors[0].r, this.colors[0].g, this.colors[0].b);
        }

        // If transformedT is above the last position, return last color
        if (clampedT >= this.colorPositions[this.colorPositions.length - 1]) {
            const lastColor = this.colors[this.colors.length - 1];
            return this._rgbToHex(lastColor.r, lastColor.g, lastColor.b);
        }

        // Find the two colors to interpolate between
        let lowerIdx = 0;
        for (let i = 0; i < this.colorPositions.length - 1; i++) {
            if (clampedT >= this.colorPositions[i]) {
                lowerIdx = i;
            }
        }

        const upperIdx = Math.min(lowerIdx + 1, this.colors.length - 1);

        // Handle edge case where we're exactly at a color position
        if (clampedT === this.colorPositions[lowerIdx]) {
            const color = this.colors[lowerIdx];
            return this._rgbToHex(color.r, color.g, color.b);
        }
        if (clampedT === this.colorPositions[upperIdx]) {
            const color = this.colors[upperIdx];
            return this._rgbToHex(color.r, color.g, color.b);
        }

        // Interpolate between the two colors
        const segmentT = (clampedT - this.colorPositions[lowerIdx]) /
            (this.colorPositions[upperIdx] - this.colorPositions[lowerIdx]);

        return this._interpolateColor(this.colors[lowerIdx], this.colors[upperIdx], segmentT);
    }

    /**
     * Interpolate between two RGB colors
     * @private
     */
    _interpolateColor(color1, color2, t) {
        const r = Math.round(color1.r + (color2.r - color1.r) * t);
        const g = Math.round(color1.g + (color2.g - color1.g) * t);
        const b = Math.round(color1.b + (color2.b - color1.b) * t);

        return this._rgbToHex(r, g, b);
    }

    /**
     * Convert hex color to RGB
     * @private
     */
    _hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    /**
     * Convert RGB to hex color
     * @private
     */
    _rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }
}

/**
 * Scale for mapping categorical values to colors
 */
export class CategoricalColorScale {
    constructor(categoryData, transformMin = 0, transformMax = 1, colors = null, colorPositions = null) {
        if (!Array.isArray(categoryData) || categoryData.length === 0) {
            throw new Error('categoryData must be a non-empty array');
        }

        this.transformMin = transformMin;
        this.transformMax = transformMax;
        this.nullColor = "#808080"; // Default grey for null/empty values

        // Calculate unique categories and their frequencies
        this.frequencyMap = new Map();
        for (const category of categoryData) {
            if (this.frequencyMap.has(category)) {
                this.frequencyMap.set(category, this.frequencyMap.get(category) + 1);
            } else {
                this.frequencyMap.set(category, 1);
            }
        }

        // Store categories in order of descending frequency
        this.categories = [...this.frequencyMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(entry => entry[0]);

        // Default to viridis-like color scheme if not provided
        if (colors === null) {
            this.colors = VIRIDIS.map(c => this._hexToRgb(c));
        } else {
            if (colors.length < 1) {
                throw new Error('At least 1 color is required');
            }
            this.colors = colors.map(c => this._hexToRgb(c));
        }

        // Handle single color case
        if (this.colors.length === 1) {
            this.colorPositions = [0];
            this._assignColors();
            return;
        }

        // Default to equally spaced positions if not provided
        if (colorPositions === null) {
            this.colorPositions = this.colors.map((_, i) => i / (this.colors.length - 1));
        } else {
            if (colorPositions.length !== this.colors.length) {
                throw new Error('colorPositions must have the same length as colors');
            }

            // Sort colorPositions and reorder colors to match
            const paired = colorPositions.map((pos, i) => ({ pos, color: this.colors[i] }));
            paired.sort((a, b) => a.pos - b.pos);

            this.colorPositions = paired.map(p => p.pos);
            this.colors = paired.map(p => p.color);

            // Normalize positions to [0, 1] range
            const minPos = this.colorPositions[0];
            const maxPos = this.colorPositions[this.colorPositions.length - 1];

            if (minPos === maxPos) {
                // All positions are the same, normalize to 0
                this.colorPositions = this.colorPositions.map(() => 0);
            } else {
                this.colorPositions = this.colorPositions.map(pos => (pos - minPos) / (maxPos - minPos));
            }
        }

        // Assign colors to categories
        this._assignColors();
    }

    /**
     * Assign colors to categories based on frequency
     * @private
     */
    _assignColors() {
        this.categoryColorMap = new Map();

        // Handle single color case
        if (this.colors.length === 1) {
            const hexColor = this._rgbToHex(this.colors[0].r, this.colors[0].g, this.colors[0].b);
            for (const category of this.categories) {
                this.categoryColorMap.set(category, hexColor);
            }
            return;
        }

        if (this.categories.length === 1) {
            // Single category gets the first color
            const color = this._getColorAtPosition(this.transformMin);
            this.categoryColorMap.set(this.categories[0], color);
        } else {
            // Multiple categories spread across the transform range
            for (let i = 0; i < this.categories.length; i++) {
                const t = i / (this.categories.length - 1);
                const transformedT = this.transformMin + t * (this.transformMax - this.transformMin);
                const color = this._getColorAtPosition(transformedT);
                this.categoryColorMap.set(this.categories[i], color);
            }
        }
    }

    /**
     * Get color at a specific position in the color scale
     * @private
     */
    _getColorAtPosition(t) {
        // Clamp t to [0, 1]
        t = Math.max(0, Math.min(1, t));

        // Handle single color case
        if (this.colors.length === 1) {
            return this._rgbToHex(this.colors[0].r, this.colors[0].g, this.colors[0].b);
        }

        // If t is below the first position, return first color
        if (t <= this.colorPositions[0]) {
            return this._rgbToHex(this.colors[0].r, this.colors[0].g, this.colors[0].b);
        }

        // If t is above the last position, return last color
        if (t >= this.colorPositions[this.colorPositions.length - 1]) {
            const lastColor = this.colors[this.colors.length - 1];
            return this._rgbToHex(lastColor.r, lastColor.g, lastColor.b);
        }

        // Find the two colors to interpolate between
        let lowerIdx = 0;
        for (let i = 0; i < this.colorPositions.length - 1; i++) {
            if (t >= this.colorPositions[i]) {
                lowerIdx = i;
            }
        }

        const upperIdx = Math.min(lowerIdx + 1, this.colors.length - 1);

        // Handle edge cases
        if (t === this.colorPositions[lowerIdx]) {
            const color = this.colors[lowerIdx];
            return this._rgbToHex(color.r, color.g, color.b);
        }
        if (t === this.colorPositions[upperIdx]) {
            const color = this.colors[upperIdx];
            return this._rgbToHex(color.r, color.g, color.b);
        }

        // Interpolate between the two colors
        const segmentT = (t - this.colorPositions[lowerIdx]) /
            (this.colorPositions[upperIdx] - this.colorPositions[lowerIdx]);

        return this._interpolateColor(this.colors[lowerIdx], this.colors[upperIdx], segmentT);
    }

    /**
     * Get the color corresponding to the given category
     * @param {*} category - The category value to map
     * @returns {string} The corresponding color as a hex string
     */
    getValue(category) {
        // Handle null/undefined/empty values
        if (category === null || category === undefined || category === '') {
            return this.nullColor;
        }

        if (this.categoryColorMap.has(category)) {
            return this.categoryColorMap.get(category);
        }

        // Error for unknown categories
        throw new Error(`Unknown category: ${category}`);
    }

    /**
     * Interpolate between two RGB colors
     * @private
     */
    _interpolateColor(color1, color2, t) {
        const r = Math.round(color1.r + (color2.r - color1.r) * t);
        const g = Math.round(color1.g + (color2.g - color1.g) * t);
        const b = Math.round(color1.b + (color2.b - color1.b) * t);

        return this._rgbToHex(r, g, b);
    }

    /**
     * Convert hex color to RGB
     * @private
     */
    _hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    /**
     * Convert RGB to hex color
     * @private
     */
    _rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }
}