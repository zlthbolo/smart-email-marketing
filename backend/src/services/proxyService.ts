import axios from 'axios';
import { logger } from '../utils/logger';
import Proxy from '../models/Proxy';

export async function fetchFreeProxies(): Promise<any[]> {
  try {
    // Fetch from multiple sources
    const sources = [
      'https://www.proxy-list.download/api/v1/get?type=http',
      'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
    ];

    const proxies: any[] = [];

    for (const source of sources) {
      try {
        const response = await axios.get(source, { timeout: 5000 });
        if (response.data) {
          const lines = response.data.split('\n').filter((line: string) => line.includes(':'));
          lines.forEach((line: string) => {
            const [host, port] = line.trim().split(':');
            if (host && port) {
              proxies.push({ host, port: parseInt(port), protocol: 'http' });
            }
          });
        }
      } catch (error) {
        logger.warn(`Failed to fetch from ${source}`);
      }
    }

    logger.info(`Fetched ${proxies.length} proxies`);
    return proxies;
  } catch (error) {
    logger.error('Error fetching proxies:', error);
    return [];
  }
}

export async function testProxy(proxy: any): Promise<boolean> {
  try {
    const url = 'http://httpbin.org/ip';
    const response = await axios.get(url, {
      httpAgent: new (require('http').Agent)({
        proxy: `http://${proxy.host}:${proxy.port}`,
      }),
      timeout: 5000,
    });
    return !!response.data;
  } catch (error) {
    return false;
  }
}

export async function assignProxyToAccount(accountId: string, proxyId: string): Promise<boolean> {
  try {
    const proxy = await Proxy.findByPk(proxyId);
    if (proxy) {
      await proxy.update({ assignedToAccountId: accountId });
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Error assigning proxy:', error);
    return false;
  }
}
