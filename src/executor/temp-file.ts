// src/executor/temp-file.ts

import fs from 'fs-extra';
import * as path from 'path';
import type { OpenCodeRunOutput } from '../types/index.js';

/**
 * 将 outputs 写入临时 JSON 文件
 * 文件存放在测试临时目录下的 .judges/ 子目录
 */
export async function writeTempJson(
  outputs: OpenCodeRunOutput[],
  tempRoot: string
): Promise<string> {
  // 创建裁判子目录
  const judgeDir = path.join(tempRoot, '.judges');
  await fs.ensureDir(judgeDir);

  // 生成唯一文件名（使用时间戳 + 随机数）
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const fileName = `outputs-${timestamp}-${random}.json`;
  const filePath = path.join(judgeDir, fileName);

  // 写入 JSON（无缩进，减小文件大小）
  await fs.writeJson(filePath, outputs, { spaces: 0 });

  return filePath;
}