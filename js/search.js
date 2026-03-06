// 全选并替换 js/search.js 的完整内容
async function searchByAPIAndKeyWord(apiId, query) {
    try {
        let apiUrl, apiName, apiBaseUrl;
        
        if (apiId.startsWith('custom_')) {
            const customIndex = apiId.replace('custom_', '');
            const customApi = getCustomApiInfo(customIndex);
            if (!customApi) return [];
            apiBaseUrl = customApi.url;
            apiUrl = apiBaseUrl + API_CONFIG.search.path + encodeURIComponent(query);
            apiName = customApi.name;
        } else {
            if (!API_SITES[apiId]) return [];
            apiBaseUrl = API_SITES[apiId].api;
            apiUrl = apiBaseUrl + API_CONFIG.search.path + encodeURIComponent(query);
            apiName = API_SITES[apiId].name;
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const proxiedUrl = await window.ProxyAuth?.addAuthToProxyUrl ? 
            await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(apiUrl)) :
            PROXY_URL + encodeURIComponent(apiUrl);
        
        const response = await fetch(proxiedUrl, {
            headers: API_CONFIG.search.headers,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        if (!response.ok) return [];
        
        const data = await response.json();
        if (!data || !data.list || !Array.isArray(data.list) || data.list.length === 0) return [];
        
        // 核心修复：第一页海报
        const results = data.list.map(item => {
            let picUrl = item.vod_pic || item.pic || '';
            if (picUrl && picUrl.includes('doubanio.com')) {
                picUrl = `https://image.baidu.com/search/down?url=${encodeURIComponent(picUrl)}`;
            }
            return {
                ...item,
                vod_pic: picUrl,
                pic: picUrl,
                source_name: apiName,
                source_code: apiId,
                api_url: apiId.startsWith('custom_') ? getCustomApiInfo(apiId.replace('custom_', ''))?.url : undefined
            };
        });
        
        const pageCount = data.pagecount || 1;
        const pagesToFetch = Math.min(pageCount - 1, API_CONFIG.search.maxPages - 1);
        
        if (pagesToFetch > 0) {
            const additionalPagePromises = [];
            for (let page = 2; page <= pagesToFetch + 1; page++) {
                const pageUrl = apiBaseUrl + API_CONFIG.search.pagePath
                    .replace('{query}', encodeURIComponent(query))
                    .replace('{page}', page);
                
                const pagePromise = (async () => {
                    try {
                        const pageController = new AbortController();
                        const pageTimeoutId = setTimeout(() => pageController.abort(), 15000);
                        const proxiedPageUrl = await window.ProxyAuth?.addAuthToProxyUrl ? 
                            await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(pageUrl)) :
                            PROXY_URL + encodeURIComponent(pageUrl);
                        
                        const pageResponse = await fetch(proxiedPageUrl, {
                            headers: API_CONFIG.search.headers,
                            signal: pageController.signal
                        });
                        
                        clearTimeout(pageTimeoutId);
                        if (!pageResponse.ok) return [];
                        const pageData = await pageResponse.json();
                        if (!pageData || !pageData.list || !Array.isArray(pageData.list)) return [];
                        
                        // 核心修复：额外页海报
                        return pageData.list.map(item => {
                            let pUrl = item.vod_pic || item.pic || '';
                            if (pUrl && pUrl.includes('doubanio.com')) {
                                pUrl = `https://image.baidu.com/search/down?url=${encodeURIComponent(pUrl)}`;
                            }
                            return {
                                ...item,
                                vod_pic: pUrl,
                                pic: pUrl,
                                source_name: apiName,
                                source_code: apiId,
                                api_url: apiId.startsWith('custom_') ? getCustomApiInfo(apiId.replace('custom_', ''))?.url : undefined
                            };
                        });
                    } catch (e) { return []; }
                })();
                additionalPagePromises.push(pagePromise);
            }
            const additionalResults = await Promise.all(additionalPagePromises);
            additionalResults.forEach(pr => { if (pr.length > 0) results.push(...pr); });
        }
        return results;
    } catch (error) {
        console.warn(`API ${apiId} 搜索失败:`, error);
        return [];
    }
}
