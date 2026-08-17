import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONFIG_DIR = join(homedir(), '.deepseek-plugins');
export const PID_FILE = join(CONFIG_DIR, 'service.pid');
export const PORT_FILE = join(CONFIG_DIR, 'service.port');
export const MENUBAR_PID_FILE = join(CONFIG_DIR, 'menubar.pid');

export const DEEPSEEK_SERVICE = 'deepseek';

/** 请求体最大字节数（1MB），防止恶意超大请求耗尽内存。 */
export const MAX_BODY_SIZE = 1024 * 1024;
