(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/lib/dataAnalyzer.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * dataAnalyzer.ts
 * Fully dynamic column intelligence — works for ANY CSV.
 * Detects types, patterns, best groupby cols, primary metrics.
 * No assumptions about Amazon data structure.
 */ __turbopack_context__.s([
    "DISCOUNT_PATTERNS",
    ()=>DISCOUNT_PATTERNS,
    "PAYMENT_PATTERNS",
    ()=>PAYMENT_PATTERNS,
    "QTY_PATTERNS",
    ()=>QTY_PATTERNS,
    "RATING_PATTERNS",
    ()=>RATING_PATTERNS,
    "REGION_PATTERNS",
    ()=>REGION_PATTERNS,
    "REVENUE_PATTERNS",
    ()=>REVENUE_PATTERNS,
    "detectColumnType",
    ()=>detectColumnType,
    "detectSemanticRoles",
    ()=>detectSemanticRoles,
    "profileColumn",
    ()=>profileColumn,
    "scorePrimaryDimension",
    ()=>scorePrimaryDimension,
    "scorePrimaryMetric",
    ()=>scorePrimaryMetric
]);
const DATE_PATTERNS = [
    /^\d{4}-\d{2}-\d{2}/,
    /^\d{2}\/\d{2}\/\d{4}/,
    /^\d{2}-\d{2}-\d{4}/,
    /^\d{4}\/\d{2}\/\d{2}/,
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i
];
const ID_PATTERNS = [
    /_id$|^id$|_key$|^key$|_code$|^code$|_uuid$|^uuid$/i
];
const REGION_PATTERNS = [
    /region|country|state|city|location|territory|area|zone|market|geo/i
];
const PAYMENT_PATTERNS = [
    /payment|method|pay_type|transaction_type|mode|channel/i
];
const RATING_PATTERNS = [
    /rating|score|stars|review|satisfaction|nps|grade/i
];
const DISCOUNT_PATTERNS = [
    /discount|coupon|promo|reduction|off|deal/i
];
const REVENUE_PATTERNS = [
    /revenue|sales|amount|total|price|value|cost|profit|gmv|income/i
];
const QTY_PATTERNS = [
    /qty|quantity|units|count|volume|sold|orders/i
];
function detectColumnType(name, values) {
    const nonNull = values.filter((v)=>v !== null && v !== undefined && v !== '');
    if (!nonNull.length) return 'text';
    // ID check by name first
    if (ID_PATTERNS.some((p)=>p.test(name))) return 'id';
    // Check if all are numeric
    const numericCount = nonNull.filter((v)=>!isNaN(Number(v))).length;
    if (numericCount / nonNull.length > 0.85) {
        // Could still be an ID (sequential integers with high uniqueness)
        const nums = nonNull.map((v)=>Number(v));
        const unique = new Set(nums).size;
        if (unique === nonNull.length && Number.isInteger(nums[0]) && nums[0] < 1000000) {
            // Sequential-ish integers = likely ID
            const sorted = [
                ...nums
            ].sort((a, b)=>a - b);
            const isSequential = sorted[sorted.length - 1] - sorted[0] === sorted.length - 1;
            if (isSequential || unique > nonNull.length * 0.95) return 'id';
        }
        return 'numeric';
    }
    // Date check
    const dateCount = nonNull.filter((v)=>typeof v === 'string' && DATE_PATTERNS.some((p)=>p.test(v.trim()))).length;
    if (dateCount / nonNull.length > 0.7) return 'date';
    // Boolean
    const boolValues = new Set([
        'true',
        'false',
        'yes',
        'no',
        '1',
        '0',
        'y',
        'n'
    ]);
    const boolCount = nonNull.filter((v)=>boolValues.has(String(v).toLowerCase())).length;
    if (boolCount / nonNull.length > 0.85) return 'boolean';
    // Categorical vs text: low cardinality = categorical
    const uniqueCount = new Set(nonNull.map((v)=>String(v).toLowerCase())).size;
    if (uniqueCount <= Math.max(20, nonNull.length * 0.1)) return 'categorical';
    return 'text';
}
function profileColumn(name, rows) {
    const values = rows.map((r)=>r[name]);
    const nonNull = values.filter((v)=>v !== null && v !== undefined && v !== '');
    const type = detectColumnType(name, values);
    const uniqueCount = new Set(nonNull.map((v)=>String(v))).size;
    const nullCount = values.length - nonNull.length;
    const profile = {
        name,
        type,
        uniqueCount,
        nullCount,
        sampleValues: nonNull.slice(0, 5),
        isHighCardinality: uniqueCount > 50
    };
    if (type === 'numeric') {
        const nums = nonNull.map((v)=>Number(v)).filter((n)=>!isNaN(n));
        profile.min = Math.min(...nums);
        profile.max = Math.max(...nums);
        profile.mean = nums.reduce((a, b)=>a + b, 0) / nums.length;
    }
    if (type === 'categorical') {
        // Top values with count and sum (if paired with a numeric col later)
        const counts = {};
        nonNull.forEach((v)=>{
            const k = String(v);
            counts[k] = (counts[k] || 0) + 1;
        });
        profile.topValues = Object.entries(counts).sort((a, b)=>b[1] - a[1]).slice(0, 20).map(([value, count])=>({
                value,
                count,
                sum: 0
            }));
    }
    return profile;
}
function scorePrimaryMetric(profiles) {
    const numerics = profiles.filter((p)=>p.type === 'numeric' && !p.isHighCardinality);
    if (!numerics.length) return '';
    // Score: revenue-like name > large values > last column
    const scored = numerics.map((p)=>{
        let score = 0;
        if (REVENUE_PATTERNS.test(p.name)) score += 100;
        if (QTY_PATTERNS.test(p.name)) score += 50;
        if ((p.mean ?? 0) > 100) score += 30;
        if ((p.max ?? 0) > 1000) score += 20;
        // Prefer non-percentage, non-rating columns
        if (RATING_PATTERNS.test(p.name)) score -= 40;
        if (DISCOUNT_PATTERNS.test(p.name)) score -= 20;
        if ((p.max ?? 0) <= 100 && (p.min ?? 0) >= 0) score -= 10; // looks like percentage
        return {
            name: p.name,
            score
        };
    });
    return scored.sort((a, b)=>b.score - a.score)[0]?.name ?? numerics[numerics.length - 1].name;
}
function scorePrimaryDimension(profiles) {
    const cats = profiles.filter((p)=>p.type === 'categorical');
    if (!cats.length) return '';
    const scored = cats.map((p)=>{
        let score = 0;
        // Not too many, not too few unique values
        if (p.uniqueCount >= 2 && p.uniqueCount <= 15) score += 80;
        else if (p.uniqueCount <= 30) score += 40;
        // Category-like names score high
        if (/categor|type|class|group|segment|product|item|brand/i.test(p.name)) score += 60;
        if (REGION_PATTERNS.test(p.name)) score += 40;
        if (PAYMENT_PATTERNS.test(p.name)) score += 30;
        // ID cols score low
        if (ID_PATTERNS.some((p2)=>p2.test(p.name))) score -= 100;
        return {
            name: p.name,
            score
        };
    });
    return scored.sort((a, b)=>b.score - a.score)[0]?.name ?? cats[0].name;
}
function detectSemanticRoles(profiles) {
    const find = (pattern, type)=>profiles.find((p)=>pattern.test(p.name) && (!type || p.type === type))?.name ?? null;
    return {
        regionCol: find(REGION_PATTERNS, 'categorical'),
        paymentCol: find(PAYMENT_PATTERNS, 'categorical'),
        ratingCol: find(RATING_PATTERNS, 'numeric'),
        discountCol: find(DISCOUNT_PATTERNS, 'numeric'),
        quantityCol: find(QTY_PATTERNS, 'numeric'),
        revenueCol: find(REVENUE_PATTERNS, 'numeric')
    };
}
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/csvProcessor.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * csvProcessor.ts
 * Converts any CSV into a rich DatasetProfile.
 * Fully dynamic — no assumptions about column names.
 */ __turbopack_context__.s([
    "AMAZON_PROFILE",
    ()=>AMAZON_PROFILE,
    "buildSmartSuggestions",
    ()=>buildSmartSuggestions,
    "processDataset",
    ()=>processDataset
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$dataAnalyzer$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/dataAnalyzer.ts [app-client] (ecmascript)");
;
const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
];
function processDataset(rows, fileName) {
    if (!rows.length) throw new Error('Dataset is empty');
    const colNames = Object.keys(rows[0]);
    const profiles = colNames.map((name)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$dataAnalyzer$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["profileColumn"])(name, rows));
    const numericCols = profiles.filter((p)=>p.type === 'numeric').map((p)=>p.name);
    const categoricalCols = profiles.filter((p)=>p.type === 'categorical').map((p)=>p.name);
    const dateCols = profiles.filter((p)=>p.type === 'date').map((p)=>p.name);
    const idCols = profiles.filter((p)=>p.type === 'id').map((p)=>p.name);
    const primaryMetric = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$dataAnalyzer$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["scorePrimaryMetric"])(profiles);
    const primaryDimension = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$dataAnalyzer$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["scorePrimaryDimension"])(profiles);
    const dateColumn = dateCols[0] ?? null;
    const roles = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$dataAnalyzer$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["detectSemanticRoles"])(profiles);
    // Build aggregations
    const agg = buildAggregations(rows, {
        primaryMetric,
        primaryDimension,
        secondaryDimension: categoricalCols.find((c)=>c !== primaryDimension) ?? '',
        dateColumn,
        roles
    });
    // Build smart suggestions based on ACTUAL column names and data patterns
    const suggestions = buildSmartSuggestions({
        name: fileName,
        primaryMetric,
        primaryDimension,
        categoricalCols,
        dateCols,
        numericCols,
        roles,
        agg
    });
    const name = fileName.replace(/\.csv$/i, '').replace(/[_-]/g, ' ');
    return {
        name,
        rowCount: rows.length,
        columns: profiles,
        numericCols,
        categoricalCols,
        dateCols,
        idCols,
        primaryMetric,
        primaryDimension,
        dateColumn,
        hasTimeSeries: dateCols.length > 0,
        hasCategories: categoricalCols.length > 0,
        hasRegions: !!roles.regionCol,
        hasPayments: !!roles.paymentCol,
        smartSuggestions: suggestions,
        aggregations: agg
    };
}
function buildAggregations(rows, { primaryMetric, primaryDimension, secondaryDimension, dateColumn, roles }) {
    const getNum = (row, col)=>parseFloat(String(row[col] ?? 0)) || 0;
    const getStr = (row, col)=>String(row[col] ?? 'Unknown').trim();
    // 1. By primary dimension
    const byPrimaryDimension = {};
    const countByDimension = {};
    if (primaryDimension) {
        rows.forEach((r)=>{
            const k = getStr(r, primaryDimension);
            byPrimaryDimension[k] = (byPrimaryDimension[k] ?? 0) + getNum(r, primaryMetric);
            countByDimension[k] = (countByDimension[k] ?? 0) + 1;
        });
    }
    // 2. By secondary dimension
    const bySecondaryDimension = {};
    if (secondaryDimension) {
        rows.forEach((r)=>{
            const k = getStr(r, secondaryDimension);
            bySecondaryDimension[k] = (bySecondaryDimension[k] ?? 0) + getNum(r, primaryMetric);
        });
    }
    // 3. By date (monthly)
    const byDate = {};
    const dateCount = {};
    if (dateColumn) {
        rows.forEach((r)=>{
            const raw = String(r[dateColumn] ?? '');
            const ym = extractYearMonth(raw);
            if (ym) {
                byDate[ym] = (byDate[ym] ?? 0) + getNum(r, primaryMetric);
                dateCount[ym] = (dateCount[ym] ?? 0) + 1;
            }
        });
    }
    // 4. By date × primary dimension (for stacked charts)
    const byDateAndDimension = {};
    if (dateColumn && primaryDimension) {
        rows.forEach((r)=>{
            const ym = extractYearMonth(String(r[dateColumn] ?? ''));
            const dim = getStr(r, primaryDimension);
            if (ym) {
                if (!byDateAndDimension[ym]) byDateAndDimension[ym] = {};
                byDateAndDimension[ym][dim] = (byDateAndDimension[ym][dim] ?? 0) + getNum(r, primaryMetric);
            }
        });
    }
    // 5. Cross-tab: primary dimension × secondary dimension
    const crossTab = {};
    if (primaryDimension && secondaryDimension) {
        rows.forEach((r)=>{
            const dim1 = getStr(r, primaryDimension);
            const dim2 = getStr(r, secondaryDimension);
            if (!crossTab[dim1]) crossTab[dim1] = {};
            crossTab[dim1][dim2] = (crossTab[dim1][dim2] ?? 0) + getNum(r, primaryMetric);
        });
    }
    const totalMetric = Object.values(byPrimaryDimension).reduce((a, b)=>a + b, 0) || rows.reduce((s, r)=>s + getNum(r, primaryMetric), 0);
    const avgMetric = rows.length ? totalMetric / rows.length : 0;
    // Top dimensions with share
    const topDimensions = Object.entries(byPrimaryDimension).sort((a, b)=>b[1] - a[1]).slice(0, 10).map(([name, value])=>({
            name,
            value,
            share: totalMetric ? value / totalMetric : 0
        }));
    // Time series sorted
    const timeSeries = Object.entries(byDate).sort((a, b)=>a[0].localeCompare(b[0])).map(([period, value])=>({
            period,
            value,
            count: dateCount[period] ?? 0
        }));
    return {
        byPrimaryDimension,
        bySecondaryDimension,
        byDate: Object.fromEntries(Object.entries(byDate).sort()),
        byDateAndDimension,
        countByDimension,
        totalMetric,
        avgMetric,
        topDimensions,
        timeSeries,
        crossTab
    };
}
// ─── Extract YYYY-MM from various date formats ────────────────────────────────
function extractYearMonth(raw) {
    if (!raw) return null;
    // YYYY-MM-DD or YYYY/MM/DD
    const iso = raw.match(/(\d{4})[-/](\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}`;
    // DD/MM/YYYY or MM/DD/YYYY
    const dmy = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}`;
    return null;
}
function buildSmartSuggestions(p) {
    const suggestions = [];
    const m = p.primaryMetric || 'value';
    const d = p.primaryDimension || p.categoricalCols[0] || 'category';
    const topDim = p.agg.topDimensions[0]?.name;
    // Time-series suggestions
    if (p.dateCols.length) {
        suggestions.push(`Show monthly ${m} trends over time`);
        if (p.agg.timeSeries.length > 0) {
            const peak = p.agg.timeSeries.reduce((a, b)=>a.value > b.value ? a : b);
            suggestions.push(`Which month had the highest ${m}? (hint: ${formatPeriod(peak.period)})`);
        }
        suggestions.push(`Compare ${m} year over year`);
    }
    // Category suggestions
    if (p.categoricalCols.length) {
        suggestions.push(`Breakdown ${m} by ${d} as a bar chart`);
        if (topDim) suggestions.push(`Why is ${topDim} the top performer?`);
        suggestions.push(`Rank all ${d}s by ${m} as a horizontal bar`);
        suggestions.push(`Show ${m} distribution as a pie chart`);
    }
    // Region-specific
    if (p.roles.regionCol) {
        suggestions.push(`${m} breakdown by ${p.roles.regionCol}`);
        suggestions.push(`Which ${p.roles.regionCol} has the highest ${m}?`);
    }
    // Payment-specific
    if (p.roles.paymentCol) {
        suggestions.push(`Best performing ${p.roles.paymentCol} by ${m}`);
    }
    // Rating
    if (p.roles.ratingCol) {
        suggestions.push(`Relationship between ${p.roles.ratingCol} and ${m}`);
        suggestions.push(`Which ${d} has the highest ${p.roles.ratingCol}?`);
    }
    // Discount
    if (p.roles.discountCol) {
        suggestions.push(`Does ${p.roles.discountCol} increase ${m}?`);
    }
    // Quantity
    if (p.roles.quantityCol && p.roles.quantityCol !== m) {
        suggestions.push(`Compare ${m} vs ${p.roles.quantityCol} per ${d}`);
    }
    // Multiple numeric cols
    if (p.numericCols.length > 2) {
        suggestions.push(`Summarize the key metrics of this dataset`);
    }
    // Deduplicate and return top 6
    return [
        ...new Set(suggestions)
    ].slice(0, 6);
}
function formatPeriod(ym) {
    const [y, m] = ym.split('-');
    return `${MONTHS[parseInt(m) - 1]} ${y}`;
}
const AMAZON_PROFILE = {
    name: 'Amazon Sales',
    rowCount: 50000,
    columns: [],
    numericCols: [
        'price',
        'discount_percent',
        'quantity_sold',
        'rating',
        'review_count',
        'discounted_price',
        'total_revenue'
    ],
    categoricalCols: [
        'product_category',
        'customer_region',
        'payment_method'
    ],
    dateCols: [
        'order_date'
    ],
    idCols: [
        'order_id',
        'product_id'
    ],
    primaryMetric: 'total_revenue',
    primaryDimension: 'product_category',
    dateColumn: 'order_date',
    hasTimeSeries: true,
    hasCategories: true,
    hasRegions: true,
    hasPayments: true,
    smartSuggestions: [
        'Revenue breakdown by product category',
        'Monthly revenue trends 2022 vs 2023',
        'Sales breakdown by region',
        'Best performing payment method',
        'Top 3 categories by revenue',
        'Which region has the highest revenue?'
    ],
    aggregations: {
        byPrimaryDimension: {
            "Books": 5484863.03,
            "Fashion": 5480123.34,
            "Sports": 5407235.82,
            "Beauty": 5550624.97,
            "Electronics": 5470594.03,
            "Home & Kitchen": 5473132.55
        },
        bySecondaryDimension: {
            "North America": 8277217.84,
            "Asia": 8175199.83,
            "Europe": 8112311.57,
            "Middle East": 8301844.5
        },
        byPaymentDimension: {
            "Wallet": 6678638.47,
            "UPI": 6579441.44,
            "Cash on Delivery": 6546386.94,
            "Credit Card": 6540087.16,
            "Debit Card": 6522019.73
        },
        payCount: {
            "Wallet": 10106,
            "UPI": 10078,
            "Cash on Delivery": 9927,
            "Credit Card": 9908,
            "Debit Card": 9981
        },
        byDate: {
            "2022-01": 1419751.89,
            "2022-02": 1266714.29,
            "2022-03": 1392585.42,
            "2022-04": 1371955.83,
            "2022-05": 1374779.57,
            "2022-06": 1352125.49,
            "2022-07": 1346089.18,
            "2022-08": 1449308.06,
            "2022-09": 1403967.06,
            "2022-10": 1334818.11,
            "2022-11": 1291100.05,
            "2022-12": 1386209.61,
            "2023-01": 1464174.99,
            "2023-02": 1238380.51,
            "2023-03": 1366418.41,
            "2023-04": 1307017.94,
            "2023-05": 1431398.77,
            "2023-06": 1394822.13,
            "2023-07": 1442176.66,
            "2023-08": 1396321.88,
            "2023-09": 1341007.86,
            "2023-10": 1425936.23,
            "2023-11": 1334328.47,
            "2023-12": 1335185.33
        },
        byDateAndDimension: {},
        countByDimension: {
            "Books": 8334,
            "Fashion": 8330,
            "Sports": 8244,
            "Beauty": 8382,
            "Electronics": 8271,
            "Home & Kitchen": 8279
        },
        totalMetric: 32866573.74,
        avgMetric: 657.33,
        topDimensions: [
            {
                name: 'Beauty',
                value: 5550624.97,
                share: 0.169
            },
            {
                name: 'Books',
                value: 5484863.03,
                share: 0.167
            },
            {
                name: 'Fashion',
                value: 5480123.34,
                share: 0.167
            },
            {
                name: 'Home & Kitchen',
                value: 5473132.55,
                share: 0.167
            },
            {
                name: 'Electronics',
                value: 5470594.03,
                share: 0.166
            },
            {
                name: 'Sports',
                value: 5407235.82,
                share: 0.164
            }
        ],
        timeSeries: Object.entries({
            "2022-01": 1419751.89,
            "2022-02": 1266714.29,
            "2022-03": 1392585.42,
            "2022-04": 1371955.83,
            "2022-05": 1374779.57,
            "2022-06": 1352125.49,
            "2022-07": 1346089.18,
            "2022-08": 1449308.06,
            "2022-09": 1403967.06,
            "2022-10": 1334818.11,
            "2022-11": 1291100.05,
            "2022-12": 1386209.61,
            "2023-01": 1464174.99,
            "2023-02": 1238380.51,
            "2023-03": 1366418.41,
            "2023-04": 1307017.94,
            "2023-05": 1431398.77,
            "2023-06": 1394822.13,
            "2023-07": 1442176.66,
            "2023-08": 1396321.88,
            "2023-09": 1341007.86,
            "2023-10": 1425936.23,
            "2023-11": 1334328.47,
            "2023-12": 1335185.33
        }).map(([period, value])=>({
                period,
                value,
                count: 2000
            })),
        crossTab: {
            "North America": {
                "Books": 1333669.82,
                "Beauty": 1402769.67,
                "Home & Kitchen": 1401485.02,
                "Electronics": 1364757.86,
                "Fashion": 1389302.51,
                "Sports": 1385232.96
            },
            "Asia": {
                "Fashion": 1334485.23,
                "Sports": 1358085.08,
                "Books": 1391961.69,
                "Home & Kitchen": 1369676.45,
                "Electronics": 1319074.46,
                "Beauty": 1401916.92
            },
            "Europe": {
                "Sports": 1323763.2,
                "Electronics": 1407118.94,
                "Home & Kitchen": 1326424.56,
                "Beauty": 1358226.42,
                "Fashion": 1366107.0,
                "Books": 1330671.45
            },
            "Middle East": {
                "Books": 1428560.07,
                "Beauty": 1387711.96,
                "Fashion": 1390228.6,
                "Sports": 1340154.58,
                "Electronics": 1379642.77,
                "Home & Kitchen": 1375546.52
            }
        }
    }
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/store/appStore.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useActiveDataset",
    ()=>useActiveDataset,
    "useActiveTab",
    ()=>useActiveTab,
    "useAppStore",
    ()=>useAppStore
]);
/**
 * appStore.ts
 * Zustand global state — tabs, threads, AI selection, theme
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/react.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/middleware.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$csvProcessor$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/csvProcessor.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
;
;
;
const DEFAULT_TAB = {
    id: 'default',
    name: 'Amazon Sales',
    threads: [],
    dataset: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$csvProcessor$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AMAZON_PROFILE"]
};
const useAppStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["create"])()((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$middleware$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["persist"])((set, get)=>({
        tabs: [
            DEFAULT_TAB
        ],
        activeTabId: 'default',
        activeAI: 'gemini',
        isLoading: false,
        thinkStep: 0,
        theme: 'dark',
        setTheme: (theme)=>set({
                theme
            }),
        setActiveAI: (activeAI)=>set({
                activeAI
            }),
        setLoading: (isLoading)=>set({
                isLoading
            }),
        setThinkStep: (thinkStep)=>set({
                thinkStep
            }),
        addTab: (tab)=>set((s)=>({
                    tabs: [
                        ...s.tabs,
                        tab
                    ],
                    activeTabId: tab.id
                })),
        closeTab: (id)=>set((s)=>{
                const tabs = s.tabs.filter((t)=>t.id !== id);
                if (!tabs.length) {
                    return {
                        tabs: [
                            {
                                ...DEFAULT_TAB,
                                threads: []
                            }
                        ],
                        activeTabId: 'default'
                    };
                }
                const activeTabId = s.activeTabId === id ? tabs[tabs.length - 1].id : s.activeTabId;
                return {
                    tabs,
                    activeTabId
                };
            }),
        switchTab: (activeTabId)=>set({
                activeTabId
            }),
        addThread: (tabId, thread)=>set((s)=>({
                    tabs: s.tabs.map((t)=>t.id === tabId ? {
                            ...t,
                            threads: [
                                thread,
                                ...t.threads
                            ]
                        } : t)
                })),
        clearThreads: (tabId)=>set((s)=>({
                    tabs: s.tabs.map((t)=>t.id === tabId ? {
                            ...t,
                            threads: []
                        } : t)
                })),
        setDataset: (tabId, dataset)=>set((s)=>({
                    tabs: s.tabs.map((t)=>t.id === tabId ? {
                            ...t,
                            dataset
                        } : t)
                })),
        updateTabName: (tabId, name)=>set((s)=>({
                    tabs: s.tabs.map((t)=>t.id === tabId ? {
                            ...t,
                            name
                        } : t)
                }))
    }), {
    name: 'flow-app-state',
    partialize: (s)=>({
            theme: s.theme,
            activeAI: s.activeAI
        })
}));
const useActiveTab = ()=>{
    _s();
    const { tabs, activeTabId } = useAppStore();
    return tabs.find((t)=>t.id === activeTabId) ?? tabs[0];
};
_s(useActiveTab, "wWOIruHEiz+n3nFmxm0RFCg7uXY=", false, function() {
    return [
        useAppStore
    ];
});
const useActiveDataset = ()=>{
    _s1();
    const tab = useActiveTab();
    return tab?.dataset ?? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$csvProcessor$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AMAZON_PROFILE"];
};
_s1(useActiveDataset, "thCVAJtotIQJiykV3I5uWShA39E=", false, function() {
    return [
        useActiveTab
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/promptBuilder.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * promptBuilder.ts
 * Builds the AI prompt dynamically from dataset profile.
 * Works for ANY dataset — no hardcoded Amazon assumptions.
 */ __turbopack_context__.s([
    "buildPrompt",
    ()=>buildPrompt
]);
// Convert snake_case/camelCase column names to human readable
function humanize(col) {
    return col.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (l)=>l.toUpperCase()).trim();
}
function buildPrompt(query, profile) {
    const ctx = buildContext(profile);
    const schema = buildResponseSchema();
    const rules = buildRules(profile);
    return `You are FLOW, an elite Business Intelligence AI. Analyze the question and return ONLY valid JSON — no markdown, no text outside JSON.

${ctx}

USER QUESTION: "${query}"

${schema}

${rules}`;
}
// ─── Dataset context ──────────────────────────────────────────────────────────
function buildContext(p) {
    const agg = p.aggregations;
    const topDims = agg.topDimensions.slice(0, 6).map((d)=>`${d.name}: ${formatVal(d.value)} (${(d.share * 100).toFixed(1)}%)`).join(', ');
    const dateRange = agg.timeSeries.length ? `${agg.timeSeries[0].period} to ${agg.timeSeries[agg.timeSeries.length - 1].period}` : 'N/A';
    const secDims = Object.entries(agg.bySecondaryDimension).sort((a, b)=>b[1] - a[1]).slice(0, 5).map(([k, v])=>`${k}: ${formatVal(v)}`).join(', ');
    const lines = [
        `=== DATASET: ${p.name} ===`,
        `Rows: ${p.rowCount.toLocaleString()} | Date range: ${dateRange}`,
        `Columns: ${p.columns.map((c)=>`${c.name} (${c.type})`).join(', ')}`,
        `Primary metric: "${humanize(p.primaryMetric)}" (column: ${p.primaryMetric}) | Primary dimension: "${humanize(p.primaryDimension)}" (column: ${p.primaryDimension})`,
        ,
        ``,
        `TOP ${p.primaryDimension || 'CATEGORIES'} BY ${p.primaryMetric || 'VALUE'}:`,
        topDims || 'N/A',
        ``,
        p.categoricalCols[1] ? `${p.categoricalCols[1].toUpperCase()}: ${secDims || 'N/A'}` : '',
        p.hasTimeSeries ? `TIME SERIES: ${agg.timeSeries.length} periods of data available` : '',
        ``,
        `TOTALS: Revenue/Metric total = ${formatVal(agg.totalMetric)} | Avg per row = ${formatVal(agg.avgMetric)}`
    ].filter(Boolean);
    return `DATA CONTEXT:\n${lines.join('\n')}`;
}
// ─── Response schema ──────────────────────────────────────────────────────────
function buildResponseSchema() {
    return `RETURN THIS EXACT JSON:
{
  "intent": "revenue|category|region|payment|trend|comparison|rating|discount|top_n|custom|out_of_scope",
  "insight": "2-3 sentence executive summary with specific numbers from the data. Use **bold** for key findings.",
  "anomalies": [{"type": "warn|info|danger", "text": "short finding, max 10 words"}],
  "kpis": [{"label": "Metric Name", "value": "$1.2M", "sub": "context", "trend": "up|dn|none", "color": "c1|c2|c3|c4"}],
  "chartRecommendation": "One sentence: why this chart type is best for this question.",
  "charts": [
    {
      "type": "line|bar|horizontalBar|doughnut|radar",
      "title": "Descriptive chart title",
      "subtitle": "What this shows",
      "span": 1,
      "labels": ["label1", "label2"],
      "datasets": [{"label": "Series", "data": [100, 200], "color": 0}]
    }
  ],
  "table": {"show": true, "headers": ["Col1", "Col2"], "rows": [["val1", "val2"]]},
  "followups": ["Dataset-specific follow-up 1?", "Follow-up 2?", "Follow-up 3?"]
}`;
}
// ─── Rules ────────────────────────────────────────────────────────────────────
function buildRules(p) {
    return `STRICT RULES:
1. Use ONLY data from the dataset context above — never invent numbers
2. 2–4 KPIs always relevant to the question
3. 1–3 charts chosen intelligently:
   - Time series data → "line" 
   - Rankings/comparisons → "horizontalBar" (labels stay readable)
   - Proportions/share → "doughnut"
   - Multi-attribute → "radar"
   - If user explicitly says a chart type (e.g. "horizontal bar"), USE THAT EXACT TYPE
4. Follow-ups must reference ACTUAL column names: ${p.categoricalCols.slice(0, 3).join(', ') || 'the dataset columns'}
5. If question is outside dataset scope, set intent to "out_of_scope"
6. All data values in charts must come from the dataset context provided`;
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatVal(v) {
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    return v.toFixed(2);
} // Note: secondaryDimension is computed from categoricalCols[1] in csvProcessor
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/chartSelector.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * chartSelector.ts
 * Determines best chart type and provides recommendation text.
 * Reads user query AND data characteristics.
 */ __turbopack_context__.s([
    "formatPeriodLabel",
    ()=>formatPeriodLabel,
    "selectChartType",
    ()=>selectChartType
]);
// ─── Explicit user requests override everything ───────────────────────────────
const EXPLICIT_CHART_PATTERNS = [
    {
        pattern: /horizontal.?bar|hbar|h\.?bar|ranking|ranked/i,
        type: 'horizontalBar',
        label: 'horizontal bar'
    },
    {
        pattern: /\bbar\b(?!.*pie|.*dough|.*line)/i,
        type: 'bar',
        label: 'bar chart'
    },
    {
        pattern: /\bline\b|trend.?line/i,
        type: 'line',
        label: 'line chart'
    },
    {
        pattern: /pie|donut|doughnut|circle|proportion/i,
        type: 'doughnut',
        label: 'pie/doughnut'
    },
    {
        pattern: /radar|spider|web.?chart/i,
        type: 'radar',
        label: 'radar chart'
    },
    {
        pattern: /scatter|correlation|plot/i,
        type: 'scatter',
        label: 'scatter plot'
    }
];
function selectChartType(query, profile, context = 'primary') {
    const q = query.toLowerCase();
    // 1. Explicit user request — always honor
    for (const { pattern, type, label } of EXPLICIT_CHART_PATTERNS){
        if (pattern.test(query)) {
            return {
                type,
                reason: `You requested a ${label} — chosen exactly as asked.`
            };
        }
    }
    // 2. Time-series queries → line
    const isTimeSeries = /trend|over.?time|month|year|quarter|daily|weekly|timeline|2022|2023|period|historical/i.test(q);
    if (isTimeSeries && profile.hasTimeSeries) {
        return {
            type: 'line',
            reason: 'Line chart — best for showing trends over time, peaks, and seasonality.'
        };
    }
    // 3. Ranking / top-N → horizontal bar
    const isRanking = /top|best|highest|lowest|worst|rank|compare|versus|vs\b/i.test(q);
    if (isRanking) {
        return {
            type: 'horizontalBar',
            reason: 'Horizontal bar — perfect for rankings, labels stay readable and values are easy to compare.'
        };
    }
    // 4. Proportion / share → doughnut
    const isProportion = /share|proportion|breakdown|distribution|percentage|percent|split|composition/i.test(q);
    if (isProportion) {
        return {
            type: 'doughnut',
            reason: 'Doughnut chart — shows each segment\'s share of the total at a glance.'
        };
    }
    // 5. Multi-attribute comparison → radar
    const isMultiAttr = /rating|score|performance|efficiency|quality|multi/i.test(q);
    if (isMultiAttr && profile.categoricalCols.length >= 3) {
        return {
            type: 'radar',
            reason: 'Radar chart — great for comparing multiple attributes across categories simultaneously.'
        };
    }
    // 6. Secondary charts: alternate types to avoid duplication
    if (context === 'secondary') {
        if (profile.hasTimeSeries) {
            return {
                type: 'bar',
                reason: 'Bar chart — complements the trend chart with discrete period comparisons.'
            };
        }
        return {
            type: 'bar',
            reason: 'Bar chart — clear discrete comparisons for secondary analysis.'
        };
    }
    // 7. Default: if few categories (≤8) → doughnut, else horizontal bar
    const dimCount = Object.keys(profile.aggregations.byPrimaryDimension).length;
    if (dimCount <= 8 && dimCount >= 2) {
        return {
            type: 'doughnut',
            reason: 'Doughnut chart — proportional view is clearest for this number of categories.'
        };
    }
    return {
        type: 'horizontalBar',
        reason: 'Horizontal bar — best for comparing many categories with readable labels.'
    };
}
// ─── Format period label ──────────────────────────────────────────────────────
const MONTHS_SHORT = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
];
function formatPeriodLabel(ym) {
    const [y, m] = ym.split('-');
    const mIdx = parseInt(m) - 1;
    return `${MONTHS_SHORT[mIdx] ?? m} '${y?.slice(2) ?? ''}`;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/engine.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * engine.ts — AI orchestrator + fully dynamic local fallback
 * Fixes: local fallback label, column names in insights, followup underscore issue
 */ __turbopack_context__.s([
    "fmtVal",
    ()=>fmtVal,
    "queryEngine",
    ()=>queryEngine
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$promptBuilder$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/promptBuilder.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chartSelector$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/chartSelector.ts [app-client] (ecmascript)");
;
;
const MONTHS_SHORT = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
];
// ── Humanize column names ─────────────────────────────────────────────────────
function H(col) {
    return col.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (l)=>l.toUpperCase()).trim();
}
_c = H;
// ── Sanitize AI insight text — remove raw column names ────────────────────────
function sanitizeInsight(text, profile) {
    let t = text;
    // Replace all column names with humanized versions
    profile.columns.forEach((col)=>{
        const name = col.name;
        const human = H(name);
        // Replace exact matches with word boundaries
        t = t.replace(new RegExp(`\\b${name}\\b`, 'g'), human);
    });
    return t;
}
// ── Sanitize followup strings — remove underscores ───────────────────────────
function sanitizeFollowups(followups, profile) {
    return followups.map((f)=>{
        let t = f;
        profile.columns.forEach((col)=>{
            t = t.replace(new RegExp(`\\b${col.name}\\b`, 'g'), H(col.name));
        });
        return t;
    });
}
// ── Greeting/nonsense detector ────────────────────────────────────────────────
const GREETING_PATTERNS = /^(hi|hello|hey|howdy|sup|yo|what'?s up|how are you|good morning|good evening|good afternoon|thanks|thank you|bye|goodbye|ok|okay|yes|no|sure|lol|haha|test|testing|ping|who are you|what are you)\b/i;
const MIN_QUERY_LENGTH = 3;
// ── Top-N extractor ───────────────────────────────────────────────────────────
function extractTopN(query) {
    const m = query.match(/top\s+(\d+)|(\d+)\s+top|first\s+(\d+)|best\s+(\d+)/i);
    if (m) return parseInt(m[1] || m[2] || m[3] || m[4]);
    if (/top\s+(three|3)/i.test(query)) return 3;
    if (/top\s+(five|5)/i.test(query)) return 5;
    if (/top\s+(ten|10)/i.test(query)) return 10;
    return null;
}
// ── Normalize synonyms to dataset terms ──────────────────────────────────────
function normalizeQuery(query, profile) {
    let q = query;
    const dim = H(profile.primaryDimension);
    const metric = H(profile.primaryMetric);
    q = q.replace(/\b(brands?|products?|items?|types?|segments?|groups?|classes?|kinds?)\b/gi, dim);
    q = q.replace(/\b(sales?|earnings?|income|profit|money|turnover)\b/gi, metric);
    return q;
}
// Detect queries that should always use local engine (avoids Gemini misclassifying)
function isAlwaysLocal(query, profile) {
    const q = query.toLowerCase();
    // Payment queries with dataset context
    if (profile.hasPayments && /pay|method|upi|wallet|card|cash/i.test(q)) return true;
    // Region queries
    if (profile.hasRegions && /region|country|geography|location/i.test(q)) return true;
    // Clear trend queries
    if (profile.hasTimeSeries && /monthly|yearly|trend|2022|2023|over time/i.test(q)) return true;
    return false;
}
function fmtVal(v) {
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    if (v !== 0 && Math.abs(v) < 100 && v % 1 !== 0) return v.toFixed(2);
    return v.toLocaleString();
}
async function queryEngine(query, profile, aiEngine = 'gemini') {
    const trimmed = query.trim();
    // Reject greetings
    if (trimmed.length < MIN_QUERY_LENGTH || GREETING_PATTERNS.test(trimmed)) {
        return greetingResult(query, profile);
    }
    const normalizedQuery = normalizeQuery(trimmed, profile);
    const topN = extractTopN(query);
    const prompt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$promptBuilder$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildPrompt"])(normalizedQuery, profile);
    // Pre-check: if clearly a known intent, use local engine directly
    // This avoids Gemini incorrectly returning out_of_scope for valid queries
    const q = normalizedQuery.toLowerCase();
    const preIsPayment = profile.hasPayments && /pay|card|wallet|cash|upi|debit|credit|method/i.test(q);
    const preIsRegion = profile.hasRegions && /region|country|location|territory/i.test(q);
    const preIsTrend = profile.hasTimeSeries && /trend|over.?time|month|year|quarter|2022|2023/i.test(q);
    const preIsCategory = /categor|product|brand|type|segment|group/i.test(q);
    // For very short or simple intent queries, trust local engine
    if ((preIsPayment || preIsRegion || preIsTrend || preIsCategory) && normalizedQuery.split(' ').length <= 8) {
        return localEngine(normalizedQuery, profile, aiEngine, topN);
    }
    try {
        const res = await fetch('/api/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt
            })
        });
        if (!res.ok) throw new Error(`Server ${res.status}`);
        const data = await res.json();
        const raw = data.result ?? '';
        const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const jsonStart = clean.indexOf('{');
        const jsonEnd = clean.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON in AI response');
        const json = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
        if (json.intent === 'out_of_scope') return oosResult(query, profile);
        // Sanitize column names in AI response text
        const sanitized = {
            ...json,
            insight: sanitizeInsight(json.insight ?? '', profile),
            followups: sanitizeFollowups(mergeFollowups(json.followups, profile.smartSuggestions), profile),
            aiEngine,
            isLocalFallback: false
        };
        return applyTopN(sanitized, topN);
    } catch (e) {
        console.warn('AI fallback:', e.message);
        return localEngine(normalizedQuery, profile, aiEngine, topN);
    }
}
// ── Merge followups ───────────────────────────────────────────────────────────
function mergeFollowups(ai, smart) {
    const merged = [
        ...ai ?? []
    ];
    for (const s of smart){
        if (merged.length >= 4) break;
        if (!merged.some((f)=>f.toLowerCase().slice(0, 20) === s.toLowerCase().slice(0, 20))) merged.push(s);
    }
    return merged.slice(0, 4);
}
// ── Apply top-N ───────────────────────────────────────────────────────────────
function applyTopN(result, topN) {
    if (!topN) return result;
    return {
        ...result,
        charts: result.charts?.map((ch)=>{
            if (ch.type === 'line') return ch;
            const n = Math.min(topN, ch.labels.length);
            return {
                ...ch,
                labels: ch.labels.slice(0, n),
                title: ch.title.match(/top \d+/i) ? ch.title : `Top ${topN} — ${ch.title}`,
                datasets: ch.datasets.map((ds)=>({
                        ...ds,
                        data: ds.data.slice(0, n)
                    }))
            };
        }) ?? [],
        table: result.table?.show ? {
            ...result.table,
            rows: result.table.rows.slice(0, topN)
        } : result.table
    };
}
// ── Out of scope ──────────────────────────────────────────────────────────────
function oosResult(query, profile) {
    const cols = profile.categoricalCols.map(H).slice(0, 3).join(', ');
    return {
        intent: 'out_of_scope',
        insight: `**"${query}"** is outside the scope of **${profile.name}**. Try asking about **${H(profile.primaryMetric)}**, **${H(profile.primaryDimension)}**, or columns: ${cols}.`,
        anomalies: [
            {
                type: 'warn',
                text: 'Question outside dataset scope'
            }
        ],
        kpis: [],
        charts: [],
        table: {
            show: false,
            headers: [],
            rows: []
        },
        chartRecommendation: '',
        followups: profile.smartSuggestions.slice(0, 3),
        aiEngine: 'gemini',
        isLocalFallback: false
    };
}
// ── Greeting result ───────────────────────────────────────────────────────────
function greetingResult(query, profile) {
    const dims = Object.keys(profile.aggregations.byPrimaryDimension).slice(0, 3).join(', ');
    return {
        intent: 'out_of_scope',
        insight: `**"${query}"** isn't a data question. Try asking about **${H(profile.primaryDimension)}**: ${dims}, or ${H(profile.primaryMetric)}.`,
        anomalies: [
            {
                type: 'warn',
                text: 'Not a data query — try a business question'
            }
        ],
        kpis: [],
        charts: [],
        table: {
            show: false,
            headers: [],
            rows: []
        },
        chartRecommendation: '',
        followups: profile.smartSuggestions.slice(0, 3),
        aiEngine: 'gemini',
        isLocalFallback: false
    };
}
// ════════════════════════════════════════════════════════════════════════
// LOCAL ENGINE — dynamic, reads DatasetProfile
// ════════════════════════════════════════════════════════════════════════
function localEngine(query, p, ai, topN) {
    const q = query.toLowerCase();
    const agg = p.aggregations;
    const isRegion = p.hasRegions && /region|country|geography|location|territory/i.test(q);
    const isPayment = p.hasPayments && /pay|card|wallet|cash|upi|debit|credit|method/i.test(q);
    const isTrend = p.hasTimeSeries && /trend|over.?time|month|year|quarter|timeline|2022|2023|period|historical/i.test(q);
    const isRating = /rating|star|review|score|satisfaction/i.test(q);
    const isDiscount = /discount|offer|deal|promo/i.test(q);
    if (isTrend) return trendResult(query, p, ai, topN);
    if (isRegion) return dimResult(query, p, ai, topN, Object.entries(agg.bySecondaryDimension).sort((a, b)=>b[1] - a[1]), p.columns.find((c)=>/region|country/i.test(c.name))?.name ?? p.categoricalCols[1] ?? 'Region');
    if (isPayment) return dimResult(query, p, ai, topN, Object.entries(agg.bySecondaryDimension).sort((a, b)=>b[1] - a[1]), p.columns.find((c)=>/pay|method/i.test(c.name))?.name ?? 'Payment Method');
    if (isRating || isDiscount) return ratingResult(query, p, ai, topN);
    return categoryResult(query, p, ai, topN);
}
function limitByTopN(arr, n) {
    return n ? arr.slice(0, n) : arr;
}
// ── Category ──────────────────────────────────────────────────────────────────
function categoryResult(query, p, ai, topN) {
    const agg = p.aggregations;
    const raw = [
        ...agg.topDimensions
    ].sort((a, b)=>b.value - a.value);
    const sorted = limitByTopN(raw, topN);
    const top = sorted[0];
    const bottom = raw[raw.length - 1];
    const chart1 = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chartSelector$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["selectChartType"])(query, p, 'primary');
    const chart2 = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chartSelector$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["selectChartType"])('compare bar', p, 'secondary');
    const label = topN ? `Top ${topN}` : 'All';
    return {
        intent: 'category',
        insight: `**${top?.name}** leads **${H(p.primaryDimension)}** with **${fmtVal(top?.value ?? 0)}** (${((top?.share ?? 0) * 100).toFixed(1)}% share). ${topN ? `Showing top ${topN} of ${raw.length}.` : `**${bottom?.name}** is lowest at **${fmtVal(bottom?.value ?? 0)}**.`}`,
        anomalies: [
            {
                type: 'info',
                text: `${top?.name} leads: ${((top?.share ?? 0) * 100).toFixed(1)}% share`
            },
            {
                type: 'warn',
                text: `${bottom?.name} lowest — explore growth tactics`
            }
        ],
        kpis: buildCategoryKPIs(sorted, agg, p),
        chartRecommendation: chart1.reason,
        charts: [
            {
                type: chart1.type,
                title: `${label} ${H(p.primaryDimension)}s by ${H(p.primaryMetric)}`,
                subtitle: `Breakdown of ${fmtVal(agg.totalMetric)} total`,
                span: 1,
                labels: sorted.map((d)=>d.name),
                datasets: [
                    {
                        label: H(p.primaryMetric),
                        data: sorted.map((d)=>d.value),
                        color: 0
                    }
                ]
            },
            {
                type: chart2.type,
                title: `${H(p.primaryMetric)} vs Volume`,
                subtitle: 'Revenue and count comparison',
                span: 2,
                labels: sorted.map((d)=>d.name),
                datasets: [
                    {
                        label: H(p.primaryMetric),
                        data: sorted.map((d)=>d.value),
                        color: 0
                    },
                    {
                        label: 'Count',
                        data: sorted.map((d)=>agg.countByDimension[d.name] ?? 0),
                        color: 2
                    }
                ]
            }
        ],
        table: {
            show: true,
            headers: [
                '#',
                H(p.primaryDimension),
                H(p.primaryMetric),
                'Share',
                'Count'
            ],
            rows: sorted.map((d, i)=>[
                    i + 1,
                    d.name,
                    fmtVal(d.value),
                    `${(d.share * 100).toFixed(1)}%`,
                    (agg.countByDimension[d.name] ?? 0).toLocaleString()
                ])
        },
        followups: sanitizeFollowups(mergeFollowups([], p.smartSuggestions), p),
        aiEngine: ai,
        isLocalFallback: false
    };
}
// ── Trend ─────────────────────────────────────────────────────────────────────
function trendResult(query, p, ai, topN) {
    const ts = p.aggregations.timeSeries;
    if (!ts.length) return categoryResult(query, p, ai, topN);
    const vals = ts.map((t)=>t.value);
    const maxI = vals.indexOf(Math.max(...vals));
    const minI = vals.indexOf(Math.min(...vals));
    const total = vals.reduce((a, b)=>a + b, 0);
    const years = [
        ...new Set(ts.map((t)=>t.period.split('-')[0]))
    ];
    const datasets = years.length > 1 ? years.map((yr, i)=>({
            label: yr,
            data: ts.filter((t)=>t.period.startsWith(yr)).map((t)=>t.value),
            color: i
        })) : [
        {
            label: H(p.primaryMetric),
            data: vals,
            color: 0
        }
    ];
    const labels = years.length > 1 ? MONTHS_SHORT : ts.map((t)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chartSelector$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatPeriodLabel"])(t.period));
    return {
        intent: 'trend',
        insight: `Over **${ts.length} periods**, total **${H(p.primaryMetric)}** = **${fmtVal(total)}**. Peak: **${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chartSelector$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatPeriodLabel"])(ts[maxI].period)}** at **${fmtVal(ts[maxI].value)}**. Lowest: **${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chartSelector$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatPeriodLabel"])(ts[minI].period)}** at **${fmtVal(ts[minI].value)}**.`,
        anomalies: [
            {
                type: 'info',
                text: `Peak: ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chartSelector$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatPeriodLabel"])(ts[maxI].period)} — investigate drivers`
            },
            {
                type: 'warn',
                text: `Dip: ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chartSelector$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatPeriodLabel"])(ts[minI].period)} — check seasonality`
            }
        ],
        kpis: [
            {
                label: 'Total',
                value: fmtVal(total),
                sub: `${ts.length} periods`,
                trend: 'up',
                color: 'c1'
            },
            {
                label: 'Peak Month',
                value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chartSelector$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatPeriodLabel"])(ts[maxI].period),
                sub: fmtVal(ts[maxI].value),
                trend: 'up',
                color: 'c2'
            },
            {
                label: 'Monthly Avg',
                value: fmtVal(total / ts.length),
                sub: 'average',
                trend: 'none',
                color: 'c3'
            },
            {
                label: 'Periods',
                value: ts.length.toString(),
                sub: 'data points',
                trend: 'none',
                color: 'c4'
            }
        ],
        chartRecommendation: 'Line chart — best for showing trends, seasonality, and year-over-year comparison.',
        charts: [
            {
                type: 'line',
                title: `${H(p.primaryMetric)} Over Time`,
                subtitle: years.length > 1 ? 'Year-over-year comparison' : `${ts.length}-period trend`,
                span: 2,
                labels,
                datasets
            },
            {
                type: 'bar',
                title: 'Order Volume by Period',
                subtitle: 'Transaction count per period',
                span: 1,
                labels: ts.map((t)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chartSelector$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatPeriodLabel"])(t.period)),
                datasets: [
                    {
                        label: 'Orders',
                        data: ts.map((t)=>t.count),
                        color: 2
                    }
                ]
            }
        ],
        table: {
            show: false,
            headers: [],
            rows: []
        },
        followups: sanitizeFollowups(mergeFollowups([], p.smartSuggestions), p),
        aiEngine: ai,
        isLocalFallback: false
    };
}
// ── Dimension (region/payment) ────────────────────────────────────────────────
function dimResult(query, p, ai, topN, rawEntries, dimName) {
    const sorted = limitByTopN(rawEntries, topN);
    const total = rawEntries.reduce((s, [, v])=>s + v, 0);
    const chart = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$chartSelector$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["selectChartType"])(query, p, 'primary');
    return {
        intent: 'region',
        insight: `**${sorted[0]?.[0]}** leads all **${H(dimName)}**s at **${fmtVal(sorted[0]?.[1] ?? 0)}** (${((sorted[0]?.[1] ?? 0) / total * 100).toFixed(1)}% share). ${topN ? `Showing top ${topN} of ${rawEntries.length}.` : ''}`,
        anomalies: [
            {
                type: 'info',
                text: `${sorted[0]?.[0]} leads: ${((sorted[0]?.[1] ?? 0) / total * 100).toFixed(1)}% share`
            },
            {
                type: 'warn',
                text: `${rawEntries[rawEntries.length - 1]?.[0]} lowest — growth opportunity`
            }
        ],
        kpis: [
            {
                label: `Top ${H(dimName)}`,
                value: sorted[0]?.[0] ?? '—',
                sub: fmtVal(sorted[0]?.[1] ?? 0),
                trend: 'up',
                color: 'c1'
            },
            {
                label: 'Total',
                value: fmtVal(total),
                sub: 'all groups',
                trend: 'up',
                color: 'c2'
            },
            {
                label: 'Groups',
                value: sorted.length.toString(),
                sub: 'shown',
                trend: 'none',
                color: 'c3'
            },
            {
                label: 'Average',
                value: fmtVal(total / Math.max(rawEntries.length, 1)),
                sub: 'per group',
                trend: 'none',
                color: 'c4'
            }
        ],
        chartRecommendation: chart.reason,
        charts: [
            {
                type: chart.type,
                title: `${H(p.primaryMetric)} by ${H(dimName)}`,
                subtitle: `${topN ? `Top ${topN} — ` : ''}Distribution`,
                span: 1,
                labels: sorted.map((x)=>x[0]),
                datasets: [
                    {
                        label: H(p.primaryMetric),
                        data: sorted.map((x)=>x[1]),
                        color: 0
                    }
                ]
            }
        ],
        table: {
            show: true,
            headers: [
                '#',
                H(dimName),
                H(p.primaryMetric),
                'Share'
            ],
            rows: sorted.map(([name, val], i)=>[
                    i + 1,
                    name,
                    fmtVal(val),
                    `${(val / total * 100).toFixed(1)}%`
                ])
        },
        followups: sanitizeFollowups(mergeFollowups([], p.smartSuggestions), p),
        aiEngine: ai,
        isLocalFallback: false
    };
}
// ── Rating/Discount ───────────────────────────────────────────────────────────
function ratingResult(query, p, ai, topN) {
    const sorted = limitByTopN([
        ...p.aggregations.topDimensions
    ].sort((a, b)=>b.value - a.value), topN);
    return {
        intent: 'rating',
        insight: `Comparing **${H(p.primaryDimension)}** performance. **${sorted[0]?.name}** leads at **${fmtVal(sorted[0]?.value ?? 0)}**. ${topN ? `Showing top ${topN} of ${p.aggregations.topDimensions.length}.` : ''}`,
        anomalies: [
            {
                type: 'info',
                text: `${sorted[0]?.name} leads — check what drives performance`
            }
        ],
        kpis: [
            {
                label: 'Top',
                value: sorted[0]?.name ?? '—',
                sub: fmtVal(sorted[0]?.value ?? 0),
                trend: 'up',
                color: 'c1'
            },
            {
                label: 'Total',
                value: fmtVal(p.aggregations.totalMetric),
                sub: H(p.primaryMetric),
                trend: 'up',
                color: 'c2'
            },
            {
                label: 'Shown',
                value: sorted.length.toString(),
                sub: `of ${p.aggregations.topDimensions.length}`,
                trend: 'none',
                color: 'c3'
            },
            {
                label: 'Average',
                value: fmtVal(p.aggregations.avgMetric),
                sub: 'per record',
                trend: 'none',
                color: 'c4'
            }
        ],
        chartRecommendation: 'Horizontal bar — best for ranking categories clearly.',
        charts: [
            {
                type: 'horizontalBar',
                title: `${H(p.primaryDimension)} Comparison`,
                subtitle: 'Ranked by value',
                span: 2,
                labels: sorted.map((d)=>d.name),
                datasets: [
                    {
                        label: H(p.primaryMetric),
                        data: sorted.map((d)=>d.value),
                        color: 0
                    }
                ]
            }
        ],
        table: {
            show: true,
            headers: [
                '#',
                H(p.primaryDimension),
                H(p.primaryMetric),
                'Share'
            ],
            rows: sorted.map((d, i)=>[
                    i + 1,
                    d.name,
                    fmtVal(d.value),
                    `${(d.share * 100).toFixed(1)}%`
                ])
        },
        followups: sanitizeFollowups(mergeFollowups([], p.smartSuggestions), p),
        aiEngine: ai,
        isLocalFallback: false
    };
}
// ── KPI helpers ───────────────────────────────────────────────────────────────
function buildCategoryKPIs(sorted, agg, p) {
    return [
        {
            label: `Top ${H(p.primaryDimension)}`,
            value: sorted[0]?.name ?? '—',
            sub: fmtVal(sorted[0]?.value ?? 0),
            trend: 'up',
            color: 'c1'
        },
        {
            label: `Total ${H(p.primaryMetric)}`,
            value: fmtVal(agg.totalMetric),
            sub: 'all categories',
            trend: 'up',
            color: 'c2'
        },
        {
            label: 'Categories',
            value: sorted.length.toString(),
            sub: 'shown',
            trend: 'none',
            color: 'c3'
        },
        {
            label: 'Average',
            value: fmtVal(agg.totalMetric / Math.max(sorted.length, 1)),
            sub: 'per category',
            trend: 'none',
            color: 'c4'
        }
    ];
}
var _c;
__turbopack_context__.k.register(_c, "H");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/ui/index.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "EmptyState",
    ()=>EmptyState,
    "ThinkingBar",
    ()=>ThinkingBar,
    "Toast",
    ()=>Toast,
    "VoiceOverlay",
    ()=>VoiceOverlay,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
const STEPS = [
    'Understanding question',
    'Scanning dataset',
    'Selecting charts',
    'Generating insights',
    'Building dashboard'
];
function ThinkingBar({ visible, step }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `thinking-wrap ${visible ? 'visible' : ''}`,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "thinking-card",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "think-steps",
                    children: STEPS.map((s, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: `think-step ${i < step ? 'done' : i === step ? 'active' : ''}`,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "ts-dot"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/ui/index.tsx",
                                    lineNumber: 13,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: s
                                }, void 0, false, {
                                    fileName: "[project]/src/components/ui/index.tsx",
                                    lineNumber: 13,
                                    columnNumber: 40
                                }, this)
                            ]
                        }, i, true, {
                            fileName: "[project]/src/components/ui/index.tsx",
                            lineNumber: 12,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/src/components/ui/index.tsx",
                    lineNumber: 10,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "think-track",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "think-fill",
                        style: {
                            width: `${Math.min(step / STEPS.length * 100, 100)}%`
                        }
                    }, void 0, false, {
                        fileName: "[project]/src/components/ui/index.tsx",
                        lineNumber: 18,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/components/ui/index.tsx",
                    lineNumber: 17,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/ui/index.tsx",
            lineNumber: 9,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/ui/index.tsx",
        lineNumber: 8,
        columnNumber: 5
    }, this);
}
_c = ThinkingBar;
function EmptyState() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "empty-state",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "empty-glyph",
                children: "◈"
            }, void 0, false, {
                fileName: "[project]/src/components/ui/index.tsx",
                lineNumber: 28,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                children: "Your dashboard will appear here"
            }, void 0, false, {
                fileName: "[project]/src/components/ui/index.tsx",
                lineNumber: 29,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                children: "Ask a business question above to generate your first chart"
            }, void 0, false, {
                fileName: "[project]/src/components/ui/index.tsx",
                lineNumber: 30,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ui/index.tsx",
        lineNumber: 27,
        columnNumber: 5
    }, this);
}
_c1 = EmptyState;
function VoiceOverlay({ onTranscript: _ }) {
    return null;
}
_c2 = VoiceOverlay;
const Toast = /*#__PURE__*/ _s((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["forwardRef"])(_c3 = _s((_p, ref)=>{
    _s();
    const [msg, setMsg] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [show, setShow] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useImperativeHandle"])(ref, {
        "Toast.useImperativeHandle": ()=>({
                "Toast.useImperativeHandle": (m)=>{
                    setMsg(m);
                    setShow(true);
                    clearTimeout(t.current);
                    t.current = setTimeout({
                        "Toast.useImperativeHandle": ()=>setShow(false)
                    }["Toast.useImperativeHandle"], 3200);
                }
            })["Toast.useImperativeHandle"]
    }["Toast.useImperativeHandle"]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `toast ${show ? 'show' : ''}`,
        children: msg
    }, void 0, false, {
        fileName: "[project]/src/components/ui/index.tsx",
        lineNumber: 48,
        columnNumber: 10
    }, ("TURBOPACK compile-time value", void 0));
}, "ovpLDOOuG8uaRT8eu5uMbr7yxSU=")), "ovpLDOOuG8uaRT8eu5uMbr7yxSU=");
_c4 = Toast;
Toast.displayName = 'Toast';
const __TURBOPACK__default__export__ = Toast;
;
var _c, _c1, _c2, _c3, _c4;
__turbopack_context__.k.register(_c, "ThinkingBar");
__turbopack_context__.k.register(_c1, "EmptyState");
__turbopack_context__.k.register(_c2, "VoiceOverlay");
__turbopack_context__.k.register(_c3, "Toast$forwardRef");
__turbopack_context__.k.register(_c4, "Toast");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/dashboard/ThreadItem.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ThreadItem
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$chart$2e$js$2f$dist$2f$chart$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/chart.js/dist/chart.js [app-client] (ecmascript) <locals>");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
'use client';
;
;
const COLORS = [
    '#5b4fff',
    '#ff4f81',
    '#00c896',
    '#f5a623',
    '#64b5f6',
    '#ce93d8'
];
const CALPHA = COLORS.map(_c = (c)=>c + '28');
_c1 = CALPHA;
function fv(v) {
    if (typeof v !== 'number') return String(v);
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    if (v !== 0 && Math.abs(v) < 100 && v % 1 !== 0) return v.toFixed(2);
    return v.toLocaleString();
}
// ── Download CSV from table data ──────────────────────────────────────────────
function downloadCSV(headers, rows, filename) {
    const escape = (v)=>{
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
        headers.map(escape).join(','),
        ...rows.map((r)=>r.map(escape).join(','))
    ].join('\n');
    const blob = new Blob([
        csv
    ], {
        type: 'text/csv;charset=utf-8;'
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename.replace(/\s+/g, '-') + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
}
// ── ChartCard ─────────────────────────────────────────────────────────────────
function ChartCard({ ch, cid, isFirst, recommendation, tableHeaders, tableRows }) {
    _s();
    const canvasRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const chartRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ChartCard.useEffect": ()=>{
            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$chart$2e$js$2f$dist$2f$chart$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["Chart"].register(...__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$chart$2e$js$2f$dist$2f$chart$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["registerables"]);
            if (!canvasRef.current) return;
            const isDark = document.documentElement.dataset.theme !== 'light';
            const tickColor = isDark ? '#8888aa' : '#44446a';
            const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
            const tipBase = {
                backgroundColor: isDark ? 'rgba(14,14,26,0.97)' : 'rgba(255,255,255,0.97)',
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 10,
                titleColor: isDark ? '#eeeef8' : '#0c0c18',
                bodyColor: isDark ? '#8888aa' : '#44446a'
            };
            if (chartRef.current) chartRef.current.destroy();
            const dsCfg = {
                "ChartCard.useEffect.dsCfg": (ds, i)=>{
                    const col = COLORS[(ds.color || i) % COLORS.length];
                    const alp = CALPHA[(ds.color || i) % COLORS.length];
                    const solo = ch.datasets.length === 1;
                    return {
                        label: ds.label,
                        data: ds.data,
                        backgroundColor: ch.type === 'line' ? alp : solo && ch.type !== 'bar' ? COLORS.slice(0, Math.max(ds.data.length, 6)) : col,
                        borderColor: col,
                        borderWidth: ch.type === 'line' ? 2 : 1,
                        borderRadius: [
                            'bar',
                            'horizontalBar'
                        ].includes(ch.type) ? 5 : 0,
                        pointBackgroundColor: col,
                        pointRadius: ch.type === 'line' ? 4 : 0,
                        pointHoverRadius: ch.type === 'line' ? 7 : 0,
                        fill: ch.type === 'line' ? {
                            target: 'origin',
                            above: alp
                        } : false,
                        tension: .4
                    };
                }
            }["ChartCard.useEffect.dsCfg"];
            if (ch.type === 'doughnut') {
                chartRef.current = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$chart$2e$js$2f$dist$2f$chart$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["Chart"](canvasRef.current, {
                    type: 'doughnut',
                    data: {
                        labels: ch.labels,
                        datasets: [
                            {
                                data: ch.datasets[0].data,
                                backgroundColor: COLORS.slice(0, ch.labels.length),
                                borderColor: 'rgba(0,0,0,0)',
                                borderWidth: 3,
                                hoverOffset: 10
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '62%',
                        plugins: {
                            legend: {
                                position: 'right',
                                labels: {
                                    color: tickColor,
                                    font: {
                                        size: 11
                                    },
                                    boxWidth: 10
                                }
                            },
                            tooltip: {
                                ...tipBase,
                                callbacks: {
                                    label: {
                                        "ChartCard.useEffect": (c)=>{
                                            const tot = c.dataset.data.reduce({
                                                "ChartCard.useEffect.tot": (a, b)=>a + b
                                            }["ChartCard.useEffect.tot"], 0);
                                            return ` ${c.label}: ${fv(c.parsed)} (${(c.parsed / tot * 100).toFixed(1)}%)`;
                                        }
                                    }["ChartCard.useEffect"]
                                }
                            }
                        }
                    }
                });
            } else if (ch.type === 'radar') {
                chartRef.current = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$chart$2e$js$2f$dist$2f$chart$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["Chart"](canvasRef.current, {
                    type: 'radar',
                    data: {
                        labels: ch.labels,
                        datasets: ch.datasets.map({
                            "ChartCard.useEffect": (ds, i)=>({
                                    ...dsCfg(ds, i),
                                    backgroundColor: CALPHA[i],
                                    borderColor: COLORS[i],
                                    borderWidth: 2
                                })
                        }["ChartCard.useEffect"])
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            r: {
                                grid: {
                                    color: gridColor
                                },
                                pointLabels: {
                                    color: tickColor,
                                    font: {
                                        size: 11
                                    }
                                },
                                ticks: {
                                    display: false,
                                    backdropColor: 'transparent'
                                },
                                angleLines: {
                                    color: gridColor
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: ch.datasets.length > 1,
                                labels: {
                                    color: tickColor
                                }
                            },
                            tooltip: tipBase
                        }
                    }
                });
            } else if (ch.type === 'horizontalBar') {
                chartRef.current = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$chart$2e$js$2f$dist$2f$chart$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["Chart"](canvasRef.current, {
                    type: 'bar',
                    data: {
                        labels: ch.labels,
                        datasets: ch.datasets.map(dsCfg)
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                grid: {
                                    color: gridColor
                                },
                                ticks: {
                                    callback: {
                                        "ChartCard.useEffect": (v)=>fv(v)
                                    }["ChartCard.useEffect"],
                                    color: tickColor
                                }
                            },
                            y: {
                                grid: {
                                    display: false
                                },
                                ticks: {
                                    color: tickColor,
                                    font: {
                                        size: 11
                                    }
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: ch.datasets.length > 1,
                                labels: {
                                    color: tickColor
                                }
                            },
                            tooltip: {
                                ...tipBase,
                                callbacks: {
                                    label: {
                                        "ChartCard.useEffect": (c)=>` ${c.dataset.label}: ${fv(c.parsed.x)}`
                                    }["ChartCard.useEffect"]
                                }
                            }
                        }
                    }
                });
            } else if (ch.type === 'line') {
                chartRef.current = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$chart$2e$js$2f$dist$2f$chart$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["Chart"](canvasRef.current, {
                    type: 'line',
                    data: {
                        labels: ch.labels,
                        datasets: ch.datasets.map(dsCfg)
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                grid: {
                                    display: false
                                },
                                ticks: {
                                    color: tickColor,
                                    maxTicksLimit: 13
                                }
                            },
                            y: {
                                grid: {
                                    color: gridColor
                                },
                                ticks: {
                                    callback: {
                                        "ChartCard.useEffect": (v)=>fv(v)
                                    }["ChartCard.useEffect"],
                                    color: tickColor
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                position: 'top',
                                labels: {
                                    color: tickColor,
                                    usePointStyle: true,
                                    padding: 16
                                }
                            },
                            tooltip: {
                                ...tipBase,
                                callbacks: {
                                    label: {
                                        "ChartCard.useEffect": (c)=>` ${c.dataset.label}: ${fv(c.parsed.y)}`
                                    }["ChartCard.useEffect"]
                                }
                            }
                        }
                    }
                });
            } else {
                chartRef.current = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$chart$2e$js$2f$dist$2f$chart$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["Chart"](canvasRef.current, {
                    type: 'bar',
                    data: {
                        labels: ch.labels,
                        datasets: ch.datasets.map(dsCfg)
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                grid: {
                                    display: false
                                },
                                ticks: {
                                    color: tickColor,
                                    maxTicksLimit: 10
                                }
                            },
                            y: {
                                grid: {
                                    color: gridColor
                                },
                                ticks: {
                                    callback: {
                                        "ChartCard.useEffect": (v)=>fv(v)
                                    }["ChartCard.useEffect"],
                                    color: tickColor
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: ch.datasets.length > 1,
                                labels: {
                                    color: tickColor,
                                    usePointStyle: true,
                                    padding: 16
                                }
                            },
                            tooltip: {
                                ...tipBase,
                                callbacks: {
                                    label: {
                                        "ChartCard.useEffect": (c)=>` ${c.dataset.label}: ${fv(c.parsed.y)}`
                                    }["ChartCard.useEffect"]
                                }
                            }
                        }
                    }
                });
            }
            return ({
                "ChartCard.useEffect": ()=>{
                    chartRef.current?.destroy();
                }
            })["ChartCard.useEffect"];
        }
    }["ChartCard.useEffect"], [
        ch
    ]);
    const downloadPNG = ()=>{
        if (!canvasRef.current) return;
        const isDark = document.documentElement.dataset.theme !== 'light';
        const src = canvasRef.current;
        const tmp = document.createElement('canvas');
        tmp.width = src.width;
        tmp.height = src.height;
        const ctx = tmp.getContext('2d');
        ctx.fillStyle = isDark ? '#13131f' : '#ffffff';
        ctx.fillRect(0, 0, tmp.width, tmp.height);
        ctx.drawImage(src, 0, 0);
        const a = document.createElement('a');
        a.download = ch.title.replace(/\s+/g, '-') + '.png';
        a.href = tmp.toDataURL('image/png', 1);
        a.click();
    };
    const tall = ch.type === 'line' || ch.type === 'radar';
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `chart-card ${ch.span === 2 ? 'span2' : ''}`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "chart-hdr",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            isFirst && recommendation && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "rec-badge",
                                children: [
                                    "✦ ",
                                    recommendation.length > 60 ? recommendation.slice(0, 60) + '…' : recommendation
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                lineNumber: 130,
                                columnNumber: 41
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "chart-title",
                                children: ch.title
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                lineNumber: 131,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                        lineNumber: 129,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "chart-actions",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "chart-act-btn",
                                onClick: downloadPNG,
                                title: "Download chart as PNG",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    width: "12",
                                    height: "12",
                                    fill: "none",
                                    stroke: "currentColor",
                                    strokeWidth: "2",
                                    viewBox: "0 0 24 24",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                                            x: "3",
                                            y: "3",
                                            width: "18",
                                            height: "18",
                                            rx: "2"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                            lineNumber: 137,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            d: "M8 12l4 4 4-4"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                            lineNumber: 137,
                                            columnNumber: 64
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                            x1: "12",
                                            y1: "8",
                                            x2: "12",
                                            y2: "16"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                            lineNumber: 137,
                                            columnNumber: 89
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                    lineNumber: 136,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                lineNumber: 135,
                                columnNumber: 11
                            }, this),
                            tableRows.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "chart-act-btn",
                                onClick: ()=>downloadCSV(tableHeaders, tableRows, ch.title),
                                title: "Download data as CSV",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    width: "12",
                                    height: "12",
                                    fill: "none",
                                    stroke: "currentColor",
                                    strokeWidth: "2",
                                    viewBox: "0 0 24 24",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                            lineNumber: 144,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("polyline", {
                                            points: "14 2 14 8 20 8"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                            lineNumber: 145,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                            x1: "12",
                                            y1: "12",
                                            x2: "12",
                                            y2: "18"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                            lineNumber: 145,
                                            columnNumber: 52
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                            x1: "9",
                                            y1: "15",
                                            x2: "15",
                                            y2: "15"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                            lineNumber: 145,
                                            columnNumber: 91
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                    lineNumber: 143,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                lineNumber: 142,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                        lineNumber: 133,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                lineNumber: 128,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "chart-sub",
                children: ch.subtitle
            }, void 0, false, {
                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                lineNumber: 151,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `chart-wrap ${tall ? 'tall' : ''}`,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("canvas", {
                    ref: canvasRef,
                    id: cid
                }, void 0, false, {
                    fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                    lineNumber: 152,
                    columnNumber: 55
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                lineNumber: 152,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
        lineNumber: 127,
        columnNumber: 5
    }, this);
}
_s(ChartCard, "WDVG+s/RUdgzBQM+WtvU+4sd8NI=");
_c2 = ChartCard;
// ── ThreadItem ────────────────────────────────────────────────────────────────
const AI_LABELS = {
    gemini: 'Gemini 2.5 Flash'
};
function ThreadItem({ thread, index, onFollowUp }) {
    _s1();
    const r = thread.result;
    const speakBtnRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const speakingRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    const speakInsight = ()=>{
        if (!window.speechSynthesis) return;
        if (speakingRef.current) {
            window.speechSynthesis.cancel();
            speakingRef.current = false;
            speakBtnRef.current?.classList.remove('speaking');
            return;
        }
        const text = r.insight.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\s+/g, ' ').trim();
        const utt = new SpeechSynthesisUtterance(text);
        utt.rate = 0.95;
        utt.lang = 'en-US';
        const voices = window.speechSynthesis.getVoices();
        const v = voices.find((v)=>v.name.includes('Google') || v.lang === 'en-US') ?? voices[0];
        if (v) utt.voice = v;
        utt.onstart = ()=>{
            speakingRef.current = true;
            speakBtnRef.current?.classList.add('speaking');
        };
        utt.onend = utt.onerror = ()=>{
            speakingRef.current = false;
            speakBtnRef.current?.classList.remove('speaking');
        };
        window.speechSynthesis.speak(utt);
    };
    const cols = r.charts?.length === 2 ? 'cols-2' : r.charts?.length >= 3 ? 'cols-3' : 'cols-1';
    const tHeaders = r.table?.headers ?? [];
    const tRows = r.table?.rows ?? [];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "thread-item",
        id: thread.id,
        style: {
            animationDelay: `${Math.min(index, 3) * 0.06}s`
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "q-label",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "q-rule",
                        style: {
                            width: 2,
                            background: `linear-gradient(to bottom, var(--punch), transparent)`,
                            alignSelf: 'stretch',
                            flexShrink: 0,
                            borderRadius: 1
                        }
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                        lineNumber: 193,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "q-pill",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "q-pip"
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                lineNumber: 194,
                                columnNumber: 33
                            }, this),
                            thread.query
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                        lineNumber: 194,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                lineNumber: 192,
                columnNumber: 7
            }, this),
            r.insight && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "insight-panel",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "insight-meta",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "insight-label",
                                children: "Analysis"
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                lineNumber: 201,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "engine-tag",
                                children: AI_LABELS[r.aiEngine] ?? r.aiEngine
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                lineNumber: 202,
                                columnNumber: 13
                            }, this),
                            r.isLocalFallback && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "engine-tag local-tag",
                                children: "local fallback"
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                lineNumber: 203,
                                columnNumber: 35
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                        lineNumber: 200,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "insight-text",
                        dangerouslySetInnerHTML: {
                            __html: r.insight.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        }
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                        lineNumber: 205,
                        columnNumber: 11
                    }, this),
                    r.anomalies?.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "atag-row",
                        children: r.anomalies.map((a, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: `atag ${a.type}`,
                                children: [
                                    a.type === 'warn' ? '⚠' : a.type === 'info' ? '◈' : '✕',
                                    " ",
                                    a.text
                                ]
                            }, i, true, {
                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                lineNumber: 209,
                                columnNumber: 17
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                        lineNumber: 207,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        className: "speak-btn",
                        ref: speakBtnRef,
                        onClick: speakInsight,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                width: "12",
                                height: "12",
                                fill: "none",
                                stroke: "currentColor",
                                strokeWidth: "2",
                                viewBox: "0 0 24 24",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("polygon", {
                                        points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                        lineNumber: 217,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                        d: "M15.54 8.46a5 5 0 0 1 0 7.07"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                        lineNumber: 218,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                        d: "M19.07 4.93a10 10 0 0 1 0 14.14"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                        lineNumber: 218,
                                        columnNumber: 55
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                lineNumber: 216,
                                columnNumber: 13
                            }, this),
                            "Speak result"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                        lineNumber: 215,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                lineNumber: 199,
                columnNumber: 9
            }, this),
            r.kpis?.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "kpi-row",
                children: r.kpis.map((k, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `kpi-card ${k.color}`,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "kpi-lbl",
                                children: k.label
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                lineNumber: 230,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "kpi-val",
                                children: k.value
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                lineNumber: 231,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "kpi-sub",
                                children: k.sub
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                lineNumber: 232,
                                columnNumber: 15
                            }, this),
                            k.trend !== 'none' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: `kpi-trend ${k.trend}`,
                                children: k.trend === 'up' ? '↑ Positive' : '↓ Watch'
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                lineNumber: 233,
                                columnNumber: 34
                            }, this)
                        ]
                    }, i, true, {
                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                        lineNumber: 229,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                lineNumber: 227,
                columnNumber: 9
            }, this),
            r.charts?.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `chart-grid ${cols}`,
                children: r.charts.map((ch, ci)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ChartCard, {
                        ch: ch,
                        cid: `c-${thread.id}-${ci}`,
                        isFirst: ci === 0,
                        recommendation: r.chartRecommendation ?? '',
                        tableHeaders: tHeaders,
                        tableRows: tRows
                    }, ci, false, {
                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                        lineNumber: 243,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                lineNumber: 241,
                columnNumber: 9
            }, this),
            r.table?.show && tRows.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "chart-card",
                style: {
                    marginTop: '.85rem'
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "chart-hdr",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "chart-title",
                                        children: "Detailed Breakdown"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                        lineNumber: 254,
                                        columnNumber: 18
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "chart-sub",
                                        children: [
                                            tRows.length,
                                            " entries"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                        lineNumber: 254,
                                        columnNumber: 71
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                lineNumber: 254,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "chart-actions",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    className: "chart-act-btn",
                                    onClick: ()=>downloadCSV(tHeaders, tRows, 'breakdown'),
                                    title: "Download as CSV",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                        width: "12",
                                        height: "12",
                                        fill: "none",
                                        stroke: "currentColor",
                                        strokeWidth: "2",
                                        viewBox: "0 0 24 24",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                                lineNumber: 258,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("polyline", {
                                                points: "14 2 14 8 20 8"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                                lineNumber: 259,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                                x1: "12",
                                                y1: "12",
                                                x2: "12",
                                                y2: "18"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                                lineNumber: 259,
                                                columnNumber: 54
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                                x1: "9",
                                                y1: "15",
                                                x2: "15",
                                                y2: "15"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                                lineNumber: 259,
                                                columnNumber: 93
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                        lineNumber: 257,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                    lineNumber: 256,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                lineNumber: 255,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                        lineNumber: 253,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "tbl-wrap",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("thead", {
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                        children: tHeaders.map((h, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                children: h
                                            }, i, false, {
                                                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                                lineNumber: 266,
                                                columnNumber: 47
                                            }, this))
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                        lineNumber: 266,
                                        columnNumber: 22
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                    lineNumber: 266,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tbody", {
                                    children: tRows.map((row, ri)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                            children: row.map((cell, ci)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                    children: ci === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        className: `rbadge ${ri === 0 ? 'g' : ri === 1 ? 's' : ri === 2 ? 'b' : ''}`,
                                                        children: cell
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                                        lineNumber: 270,
                                                        columnNumber: 42
                                                    }, this) : cell
                                                }, ci, false, {
                                                    fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                                    lineNumber: 270,
                                                    columnNumber: 21
                                                }, this))
                                        }, ri, false, {
                                            fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                            lineNumber: 269,
                                            columnNumber: 19
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                    lineNumber: 267,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                            lineNumber: 265,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                        lineNumber: 264,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                lineNumber: 252,
                columnNumber: 9
            }, this),
            r.followups?.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "fstrip",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flbl",
                        children: "Suggested follow-ups"
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                        lineNumber: 282,
                        columnNumber: 11
                    }, this),
                    r.followups.map((f, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "fchip",
                            onClick: ()=>onFollowUp(f),
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    viewBox: "0 0 24 24",
                                    strokeWidth: "1.5",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                        strokeLinecap: "round",
                                        d: "M5 12h14M12 5l7 7-7 7"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                        lineNumber: 285,
                                        columnNumber: 58
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                                    lineNumber: 285,
                                    columnNumber: 15
                                }, this),
                                f
                            ]
                        }, i, true, {
                            fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                            lineNumber: 284,
                            columnNumber: 13
                        }, this))
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
                lineNumber: 281,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/dashboard/ThreadItem.tsx",
        lineNumber: 189,
        columnNumber: 5
    }, this);
}
_s1(ThreadItem, "GWQxcrxY8jEp7+kVV7sRhLqiDUY=");
_c3 = ThreadItem;
var _c, _c1, _c2, _c3;
__turbopack_context__.k.register(_c, "CALPHA$COLORS.map");
__turbopack_context__.k.register(_c1, "CALPHA");
__turbopack_context__.k.register(_c2, "ChartCard");
__turbopack_context__.k.register(_c3, "ThreadItem");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Page
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$store$2f$appStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/store/appStore.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/engine.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$csvProcessor$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/csvProcessor.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/index.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$ThreadItem$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/dashboard/ThreadItem.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
const PLACEHOLDERS = [
    'Show revenue breakdown by category…',
    'Monthly sales trends 2022 vs 2023…',
    'Top 3 categories by revenue…',
    'Sales breakdown by region…',
    'Which payment method performs best?',
    'Highest rated product categories…'
];
const SUGGEST_CHIPS = [
    'Revenue breakdown by product category',
    'Monthly revenue trends 2022 vs 2023',
    'Sales breakdown by region',
    'Revenue by payment method',
    'Top 3 categories by revenue'
];
function Page() {
    _s();
    const { tabs, activeTabId, theme, isLoading, thinkStep, setTheme, setLoading, setThinkStep, addThread, addTab, setDataset, updateTabName, clearThreads, switchTab, closeTab } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$store$2f$appStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAppStore"])();
    const activeTab = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$store$2f$appStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useActiveTab"])();
    const dataset = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$store$2f$appStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useActiveDataset"])();
    const toastRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])({
        "Page.useRef[toastRef]": ()=>{}
    }["Page.useRef[toastRef]"]);
    const thinkTimer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])();
    const [query, setQuery] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [voiceActive, setVoiceActive] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [voiceText, setVoiceText] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [phIdx, setPhIdx] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const [phFade, setPhFade] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const recRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const vtRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])('');
    const taRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const hasResults = activeTab.threads.length > 0;
    // Apply theme
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Page.useEffect": ()=>{
            document.documentElement.dataset.theme = theme;
        }
    }["Page.useEffect"], [
        theme
    ]);
    // Animated placeholder cycle
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Page.useEffect": ()=>{
            const iv = setInterval({
                "Page.useEffect.iv": ()=>{
                    setPhFade(false);
                    setTimeout({
                        "Page.useEffect.iv": ()=>{
                            setPhIdx({
                                "Page.useEffect.iv": (i)=>(i + 1) % PLACEHOLDERS.length
                            }["Page.useEffect.iv"]);
                            setPhFade(true);
                        }
                    }["Page.useEffect.iv"], 350);
                }
            }["Page.useEffect.iv"], 3000);
            return ({
                "Page.useEffect": ()=>clearInterval(iv)
            })["Page.useEffect"];
        }
    }["Page.useEffect"], []);
    // ── Animated chart background canvas ────────────────────────────────────────
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Page.useEffect": ()=>{
            const canvas = document.getElementById('bg-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            let raf;
            let W = window.innerWidth, H = window.innerHeight;
            canvas.width = W;
            canvas.height = H;
            const onResize = {
                "Page.useEffect.onResize": ()=>{
                    W = window.innerWidth;
                    H = window.innerHeight;
                    canvas.width = W;
                    canvas.height = H;
                }
            }["Page.useEffect.onResize"];
            window.addEventListener('resize', onResize);
            // Generate multiple line chart paths that animate slowly
            const NUM_LINES = 5;
            const lines = [
                {
                    points: [],
                    color: 'rgba(108,95,255,0.18)',
                    lightColor: 'rgba(79,63,232,0.12)',
                    offset: 0,
                    speed: 0.004,
                    amplitude: 60,
                    baseY: .30,
                    phase: 0
                },
                {
                    points: [],
                    color: 'rgba(255,92,155,0.13)',
                    lightColor: 'rgba(212,56,120,0.08)',
                    offset: 0.3,
                    speed: 0.003,
                    amplitude: 45,
                    baseY: .50,
                    phase: 1.2
                },
                {
                    points: [],
                    color: 'rgba(0,223,162,0.12)',
                    lightColor: 'rgba(10,158,116,0.08)',
                    offset: 0.6,
                    speed: 0.005,
                    amplitude: 55,
                    baseY: .68,
                    phase: 2.4
                },
                {
                    points: [],
                    color: 'rgba(255,179,71,0.10)',
                    lightColor: 'rgba(196,120,0,0.07)',
                    offset: 0.2,
                    speed: 0.0035,
                    amplitude: 40,
                    baseY: .20,
                    phase: 0.8
                },
                {
                    points: [],
                    color: 'rgba(108,95,255,0.08)',
                    lightColor: 'rgba(79,63,232,0.06)',
                    offset: 0.8,
                    speed: 0.0025,
                    amplitude: 35,
                    baseY: .82,
                    phase: 1.8
                }
            ];
            // Grid dots
            const GRID_COLS = Math.ceil(W / 90);
            const GRID_ROWS = Math.ceil(H / 90);
            let t = 0;
            const draw = {
                "Page.useEffect.draw": ()=>{
                    ctx.clearRect(0, 0, W, H);
                    const isDark = document.documentElement.dataset.theme !== 'light';
                    t += 1;
                    // Subtle grid dots
                    const dotAlpha = isDark ? 0.06 : 0.04;
                    ctx.fillStyle = isDark ? `rgba(150,140,255,${dotAlpha})` : `rgba(80,60,200,${dotAlpha})`;
                    for(let r = 0; r <= GRID_ROWS; r++){
                        for(let col = 0; col <= GRID_COLS; col++){
                            ctx.beginPath();
                            ctx.arc(col * 90, r * 90, 1, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                    // Animated line charts
                    lines.forEach({
                        "Page.useEffect.draw": (line)=>{
                            const numPts = 14;
                            const stepX = W / (numPts - 1);
                            const baseY = line.baseY * H;
                            // Build smooth path
                            ctx.beginPath();
                            for(let i = 0; i < numPts; i++){
                                const x = i * stepX;
                                // Multi-frequency wave for natural chart look
                                const y = baseY - Math.sin(i * 0.55 + t * line.speed + line.phase) * line.amplitude - Math.sin(i * 0.28 + t * line.speed * 0.7 + line.phase * 1.3) * line.amplitude * 0.4 - Math.sin(i * 0.9 + t * line.speed * 1.4 + line.phase * 0.7) * line.amplitude * 0.2;
                                if (i === 0) ctx.moveTo(x, y);
                                else {
                                    // Smooth bezier curve
                                    const px = (i - 1) * stepX;
                                    const py = baseY - Math.sin((i - 1) * 0.55 + t * line.speed + line.phase) * line.amplitude - Math.sin((i - 1) * 0.28 + t * line.speed * 0.7 + line.phase * 1.3) * line.amplitude * 0.4 - Math.sin((i - 1) * 0.9 + t * line.speed * 1.4 + line.phase * 0.7) * line.amplitude * 0.2;
                                    const cpx = (px + x) / 2;
                                    ctx.bezierCurveTo(cpx, py, cpx, y, x, y);
                                }
                            }
                            ctx.strokeStyle = isDark ? line.color : line.lightColor;
                            ctx.lineWidth = 1.5;
                            ctx.stroke();
                            // Draw small data point dots at each vertex
                            for(let i = 0; i < numPts; i++){
                                const x = i * stepX;
                                const y = baseY - Math.sin(i * 0.55 + t * line.speed + line.phase) * line.amplitude - Math.sin(i * 0.28 + t * line.speed * 0.7 + line.phase * 1.3) * line.amplitude * 0.4 - Math.sin(i * 0.9 + t * line.speed * 1.4 + line.phase * 0.7) * line.amplitude * 0.2;
                                // Only draw dots at every 3rd point to keep it subtle
                                if (i % 3 === 0) {
                                    ctx.beginPath();
                                    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
                                    ctx.fillStyle = isDark ? line.color.replace('0.18', '0.35').replace('0.13', '0.28').replace('0.12', '0.25').replace('0.10', '0.22').replace('0.08', '0.18') : line.lightColor.replace('0.12', '0.22').replace('0.08', '0.16').replace('0.07', '0.14').replace('0.06', '0.12');
                                    ctx.fill();
                                }
                            }
                        }
                    }["Page.useEffect.draw"]);
                    raf = requestAnimationFrame(draw);
                }
            }["Page.useEffect.draw"];
            draw();
            return ({
                "Page.useEffect": ()=>{
                    cancelAnimationFrame(raf);
                    window.removeEventListener('resize', onResize);
                }
            })["Page.useEffect"];
        }
    }["Page.useEffect"], []);
    // ── Thinking animation ──────────────────────────────────────────────────────
    const startThinking = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "Page.useCallback[startThinking]": ()=>{
            setLoading(true);
            setThinkStep(0);
            document.getElementById('genprog')?.classList.add('active');
            let s = 0;
            thinkTimer.current = setInterval({
                "Page.useCallback[startThinking]": ()=>{
                    if (s < 4) {
                        s++;
                        setThinkStep(s);
                    }
                }
            }["Page.useCallback[startThinking]"], 700);
        }
    }["Page.useCallback[startThinking]"], [
        setLoading,
        setThinkStep
    ]);
    const stopThinking = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "Page.useCallback[stopThinking]": ()=>{
            clearInterval(thinkTimer.current);
            setThinkStep(5);
            setTimeout({
                "Page.useCallback[stopThinking]": ()=>{
                    setLoading(false);
                    document.getElementById('genprog')?.classList.remove('active');
                }
            }["Page.useCallback[stopThinking]"], 400);
        }
    }["Page.useCallback[stopThinking]"], [
        setLoading,
        setThinkStep
    ]);
    // ── Submit ──────────────────────────────────────────────────────────────────
    const handleQuery = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "Page.useCallback[handleQuery]": async (q)=>{
            if (!q.trim() || isLoading) return;
            setQuery('');
            if (taRef.current) taRef.current.style.height = 'auto';
            startThinking();
            try {
                const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["queryEngine"])(q, dataset, 'gemini');
                const thread = {
                    id: `t-${Date.now()}`,
                    query: q,
                    result,
                    timestamp: Date.now()
                };
                addThread(activeTabId, thread);
                if (activeTab.threads.length === 0) updateTabName(activeTabId, q.slice(0, 28) + (q.length > 28 ? '…' : ''));
                setTimeout({
                    "Page.useCallback[handleQuery]": ()=>document.getElementById(thread.id)?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start'
                        })
                }["Page.useCallback[handleQuery]"], 120);
            } catch (e) {
                toastRef.current?.(`Error: ${e.message}`);
            } finally{
                stopThinking();
            }
        }
    }["Page.useCallback[handleQuery]"], [
        isLoading,
        dataset,
        activeTabId,
        activeTab.threads.length,
        startThinking,
        stopThinking,
        addThread,
        updateTabName
    ]);
    // ── Voice ───────────────────────────────────────────────────────────────────
    const toggleVoice = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "Page.useCallback[toggleVoice]": ()=>{
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) {
                toastRef.current?.('Voice not supported. Use Chrome.');
                return;
            }
            if (recRef.current) {
                recRef.current.abort();
                return;
            }
            const rec = new SR();
            rec.continuous = false;
            rec.interimResults = true;
            rec.lang = 'en-US';
            recRef.current = rec;
            vtRef.current = '';
            rec.onstart = ({
                "Page.useCallback[toggleVoice]": ()=>{
                    setVoiceActive(true);
                    setVoiceText('Listening…');
                }
            })["Page.useCallback[toggleVoice]"];
            rec.onresult = ({
                "Page.useCallback[toggleVoice]": (e)=>{
                    let final = '', interim = '';
                    for(let i = e.resultIndex; i < e.results.length; i++){
                        const t = e.results[i][0].transcript;
                        if (e.results[i].isFinal) final += t;
                        else interim += t;
                    }
                    const cur = final || interim;
                    vtRef.current = cur;
                    setVoiceText(cur || 'Listening…');
                }
            })["Page.useCallback[toggleVoice]"];
            rec.onend = ({
                "Page.useCallback[toggleVoice]": ()=>{
                    const t = vtRef.current.trim();
                    setVoiceActive(false);
                    setVoiceText('');
                    recRef.current = null;
                    if (t) setTimeout({
                        "Page.useCallback[toggleVoice]": ()=>handleQuery(t)
                    }["Page.useCallback[toggleVoice]"], 150);
                }
            })["Page.useCallback[toggleVoice]"];
            rec.onerror = ({
                "Page.useCallback[toggleVoice]": ()=>{
                    setVoiceActive(false);
                    setVoiceText('');
                    recRef.current = null;
                }
            })["Page.useCallback[toggleVoice]"];
            rec.start();
        }
    }["Page.useCallback[toggleVoice]"], [
        handleQuery
    ]);
    // ── CSV ─────────────────────────────────────────────────────────────────────
    const handleCSV = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "Page.useCallback[handleCSV]": (file)=>{
            toastRef.current?.(`Loading ${file.name}…`);
            __turbopack_context__.A("[project]/node_modules/papaparse/papaparse.min.js [app-client] (ecmascript, async loader)").then({
                "Page.useCallback[handleCSV]": ({ default: Papa })=>{
                    Papa.parse(file, {
                        header: true,
                        dynamicTyping: true,
                        skipEmptyLines: true,
                        complete (res) {
                            try {
                                const rows = res.data;
                                if (!rows.length) {
                                    toastRef.current?.('CSV is empty');
                                    return;
                                }
                                const profile = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$csvProcessor$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["processDataset"])(rows, file.name);
                                const tabId = `tab-${Date.now()}`;
                                addTab({
                                    id: tabId,
                                    name: profile.name.slice(0, 20),
                                    threads: [],
                                    dataset: profile
                                });
                                setDataset(tabId, profile);
                                toastRef.current?.(`✓ ${file.name} — ${rows.length.toLocaleString()} rows`);
                            } catch (e) {
                                toastRef.current?.(`CSV error: ${e.message}`);
                            }
                        },
                        error: {
                            "Page.useCallback[handleCSV]": (e)=>toastRef.current?.(`Parse error: ${e.message}`)
                        }["Page.useCallback[handleCSV]"]
                    });
                }
            }["Page.useCallback[handleCSV]"]);
        }
    }["Page.useCallback[handleCSV]"], [
        addTab,
        setDataset
    ]);
    const resize = ()=>{
        const el = taRef.current;
        if (el) {
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 100) + 'px';
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("canvas", {
                id: "bg-canvas",
                style: {
                    position: 'fixed',
                    inset: 0,
                    zIndex: 0,
                    pointerEvents: 'none'
                }
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 252,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "gen-progress",
                id: "genprog"
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 253,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                className: "header",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "header-left",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "logo",
                                children: "FLOW"
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 258,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "logo-sub",
                                children: "AI Business Intelligence"
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 259,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 257,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "tab-bar",
                        children: [
                            tabs.map((t)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: `tab ${t.id === activeTabId ? 'active' : ''}`,
                                    onClick: ()=>switchTab(t.id),
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "tab-name",
                                            children: t.name
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 264,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            className: "tab-close",
                                            onClick: (e)=>{
                                                e.stopPropagation();
                                                closeTab(t.id);
                                            },
                                            children: "×"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 265,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, t.id, true, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 263,
                                    columnNumber: 13
                                }, this)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "tab-new",
                                onClick: ()=>addTab({
                                        id: `tab-${Date.now()}`,
                                        name: 'New chart',
                                        threads: [],
                                        dataset: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$csvProcessor$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AMAZON_PROFILE"]
                                    }),
                                children: "+ New"
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 268,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 261,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "header-right",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "data-badge",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "live-dot"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 272,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        children: [
                                            dataset.name,
                                            " · ",
                                            dataset.rowCount.toLocaleString(),
                                            " rows"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 273,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 271,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                className: "hdr-btn",
                                title: "Upload CSV",
                                style: {
                                    cursor: 'pointer'
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                        width: "15",
                                        height: "15",
                                        fill: "none",
                                        stroke: "currentColor",
                                        strokeWidth: "2",
                                        viewBox: "0 0 24 24",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 277,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("polyline", {
                                                points: "17 8 12 3 7 8"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 277,
                                                columnNumber: 68
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                                x1: "12",
                                                y1: "3",
                                                x2: "12",
                                                y2: "15"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 277,
                                                columnNumber: 102
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 276,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "file",
                                        accept: ".csv",
                                        style: {
                                            display: 'none'
                                        },
                                        onChange: (e)=>{
                                            const f = e.target.files?.[0];
                                            if (f) handleCSV(f);
                                            e.target.value = '';
                                        }
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 279,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 275,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "hdr-btn",
                                title: "Clear results",
                                onClick: ()=>clearThreads(activeTabId),
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    width: "15",
                                    height: "15",
                                    fill: "none",
                                    stroke: "currentColor",
                                    strokeWidth: "2",
                                    viewBox: "0 0 24 24",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("polyline", {
                                            points: "3 6 5 6 21 6"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 283,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            d: "M19 6l-1 14H6L5 6"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 283,
                                            columnNumber: 48
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            d: "M10 11v6M14 11v6"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 283,
                                            columnNumber: 77
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 282,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 281,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "hdr-btn",
                                title: "Toggle theme",
                                onClick: ()=>setTheme(theme === 'dark' ? 'light' : 'dark'),
                                children: theme === 'dark' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    width: "15",
                                    height: "15",
                                    fill: "none",
                                    stroke: "currentColor",
                                    strokeWidth: "2",
                                    viewBox: "0 0 24 24",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                        d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 288,
                                        columnNumber: 115
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 288,
                                    columnNumber: 17
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                    width: "15",
                                    height: "15",
                                    fill: "none",
                                    stroke: "currentColor",
                                    strokeWidth: "2",
                                    viewBox: "0 0 24 24",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                            cx: "12",
                                            cy: "12",
                                            r: "5"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 289,
                                            columnNumber: 115
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                            x1: "12",
                                            y1: "1",
                                            x2: "12",
                                            y2: "3"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 289,
                                            columnNumber: 146
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                            x1: "12",
                                            y1: "21",
                                            x2: "12",
                                            y2: "23"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 289,
                                            columnNumber: 183
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                            x1: "4.22",
                                            y1: "4.22",
                                            x2: "5.64",
                                            y2: "5.64"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 289,
                                            columnNumber: 222
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                            x1: "18.36",
                                            y1: "18.36",
                                            x2: "19.78",
                                            y2: "19.78"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 289,
                                            columnNumber: 269
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                            x1: "1",
                                            y1: "12",
                                            x2: "3",
                                            y2: "12"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 289,
                                            columnNumber: 320
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                            x1: "21",
                                            y1: "12",
                                            x2: "23",
                                            y2: "12"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 289,
                                            columnNumber: 357
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 289,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 286,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 270,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 256,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                children: [
                    !hasResults && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "hero",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                className: "hero-headline",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "hl-white",
                                        children: "Go with"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 301,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "hl-grad",
                                        children: "Flow."
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 302,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 300,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "hero-sub",
                                children: "Ask Your Data. Get Instant Insights."
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 304,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 299,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `query-section ${hasResults ? 'results-mode' : ''}`,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "query-wrap",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "query-pill",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            className: `mic-btn ${voiceActive ? 'listening' : ''}`,
                                            onClick: toggleVoice,
                                            title: "Voice input",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                                width: "15",
                                                height: "15",
                                                fill: "none",
                                                stroke: "currentColor",
                                                strokeWidth: "2",
                                                viewBox: "0 0 24 24",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                                                        x: "9",
                                                        y: "2",
                                                        width: "6",
                                                        height: "11",
                                                        rx: "3"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 321,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                        d: "M19 10a7 7 0 0 1-14 0"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 322,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                                        x1: "12",
                                                        y1: "19",
                                                        x2: "12",
                                                        y2: "22"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 323,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("line", {
                                                        x1: "8",
                                                        y1: "22",
                                                        x2: "16",
                                                        y2: "22"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/page.tsx",
                                                        lineNumber: 324,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 320,
                                                columnNumber: 17
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 315,
                                            columnNumber: 15
                                        }, this),
                                        voiceActive && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            style: {
                                                fontSize: '.75rem',
                                                color: 'var(--a2)',
                                                whiteSpace: 'nowrap',
                                                fontFamily: "'JetBrains Mono',monospace"
                                            },
                                            children: [
                                                "🎤 ",
                                                voiceText
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 330,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            style: {
                                                flex: 1,
                                                position: 'relative',
                                                display: 'flex',
                                                alignItems: 'center'
                                            },
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                                                    ref: taRef,
                                                    value: query,
                                                    rows: 1,
                                                    className: "q-input",
                                                    onChange: (e)=>{
                                                        setQuery(e.target.value);
                                                        resize();
                                                    },
                                                    onKeyDown: (e)=>{
                                                        if (e.key === 'Enter' && !e.shiftKey) {
                                                            e.preventDefault();
                                                            handleQuery(query);
                                                        }
                                                    }
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 337,
                                                    columnNumber: 17
                                                }, this),
                                                query.length === 0 && !voiceActive && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "q-placeholder",
                                                    style: {
                                                        opacity: phFade ? 1 : 0
                                                    },
                                                    children: PLACEHOLDERS[phIdx]
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 346,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 336,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            className: `q-send ${isLoading ? 'loading' : ''}`,
                                            onClick: ()=>handleQuery(query),
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                                viewBox: "0 0 24 24",
                                                fill: "white",
                                                width: "17",
                                                height: "17",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                    d: "M22 2L11 13M22 2L15 22 11 13 2 9l20-7z"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 361,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 360,
                                                columnNumber: 17
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 356,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 313,
                                    columnNumber: 13
                                }, this),
                                !hasResults && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "chip-row",
                                    children: SUGGEST_CHIPS.map((s, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                            className: "s-chip",
                                            onClick: ()=>{
                                                setQuery(s);
                                                setTimeout(()=>handleQuery(s), 50);
                                            },
                                            children: s
                                        }, i, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 370,
                                            columnNumber: 19
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 368,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ThinkingBar"], {
                                    visible: isLoading,
                                    step: thinkStep
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 377,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 312,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 311,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        id: "dashboard-area",
                        style: {
                            marginTop: '1.5rem'
                        },
                        children: activeTab.threads.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["EmptyState"], {}, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 384,
                            columnNumber: 15
                        }, this) : activeTab.threads.map((thread, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$ThreadItem$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                thread: thread,
                                index: i,
                                onFollowUp: handleQuery
                            }, thread.id, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 386,
                                columnNumber: 17
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 382,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 296,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$index$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Toast"], {
                ref: toastRef
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 392,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
}
_s(Page, "dFyHh2FZ3OSnEwFFF/ujrNvNGpU=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$store$2f$appStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAppStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$store$2f$appStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useActiveTab"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$store$2f$appStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useActiveDataset"]
    ];
});
_c = Page;
var _c;
__turbopack_context__.k.register(_c, "Page");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_b0b4d10d._.js.map