export type QrMatrix = boolean[][];

type QrBlockGroup = {
  count: number;
  dataCodewords: number;
};

type QrVersionSpec = {
  version: number;
  ecCodewordsPerBlock: number;
  blockGroups: QrBlockGroup[];
  alignmentPatternPositions: number[];
};

// iNrBadge V1 : QR Code Model 2, mode Byte, correction M.
// Versions 1 à 10 pour garder de la marge si l'URL publique est plus longue en staging.
const QR_VERSION_SPECS: QrVersionSpec[] = [
  { version: 1, ecCodewordsPerBlock: 10, blockGroups: [{ count: 1, dataCodewords: 16 }], alignmentPatternPositions: [] },
  { version: 2, ecCodewordsPerBlock: 16, blockGroups: [{ count: 1, dataCodewords: 28 }], alignmentPatternPositions: [6, 18] },
  { version: 3, ecCodewordsPerBlock: 26, blockGroups: [{ count: 1, dataCodewords: 44 }], alignmentPatternPositions: [6, 22] },
  { version: 4, ecCodewordsPerBlock: 18, blockGroups: [{ count: 2, dataCodewords: 32 }], alignmentPatternPositions: [6, 26] },
  { version: 5, ecCodewordsPerBlock: 24, blockGroups: [{ count: 2, dataCodewords: 43 }], alignmentPatternPositions: [6, 30] },
  { version: 6, ecCodewordsPerBlock: 16, blockGroups: [{ count: 4, dataCodewords: 27 }], alignmentPatternPositions: [6, 34] },
  { version: 7, ecCodewordsPerBlock: 18, blockGroups: [{ count: 4, dataCodewords: 31 }], alignmentPatternPositions: [6, 22, 38] },
  { version: 8, ecCodewordsPerBlock: 22, blockGroups: [{ count: 2, dataCodewords: 38 }, { count: 2, dataCodewords: 39 }], alignmentPatternPositions: [6, 24, 42] },
  { version: 9, ecCodewordsPerBlock: 22, blockGroups: [{ count: 3, dataCodewords: 36 }, { count: 2, dataCodewords: 37 }], alignmentPatternPositions: [6, 26, 46] },
  { version: 10, ecCodewordsPerBlock: 26, blockGroups: [{ count: 4, dataCodewords: 43 }, { count: 1, dataCodewords: 44 }], alignmentPatternPositions: [6, 28, 50] },
];

const PAD_CODEWORDS = [0xec, 0x11] as const;

function getTotalDataCodewords(spec: QrVersionSpec) {
  return spec.blockGroups.reduce((total, group) => total + group.count * group.dataCodewords, 0);
}

function appendBits(bits: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((value >>> i) & 1);
  }
}

function bitsToCodewords(bits: number[], dataCodewordCount: number) {
  const codewords: number[] = [];
  for (let i = 0; i < dataCodewordCount; i += 1) {
    let value = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value << 1) | (bits[i * 8 + bit] || 0);
    }
    codewords.push(value);
  }
  return codewords;
}

function createDataCodewords(value: string, spec: QrVersionSpec) {
  const dataBytes = Array.from(new TextEncoder().encode(value));
  const dataCodewordCount = getTotalDataCodewords(spec);
  const capacityBits = dataCodewordCount * 8;
  const bits: number[] = [];

  appendBits(bits, 0b0100, 4); // Byte mode
  appendBits(bits, dataBytes.length, 8); // versions 1 à 9 : longueur Byte sur 8 bits
  dataBytes.forEach((byte) => appendBits(bits, byte, 8));

  const remainingBits = capacityBits - bits.length;
  appendBits(bits, 0, Math.min(4, Math.max(0, remainingBits)));
  while (bits.length % 8 !== 0) bits.push(0);

  let padIndex = 0;
  while (bits.length < capacityBits) {
    appendBits(bits, PAD_CODEWORDS[padIndex % 2], 8);
    padIndex += 1;
  }

  return bitsToCodewords(bits, dataCodewordCount);
}

function chooseVersion(value: string) {
  const byteLength = new TextEncoder().encode(value).length;
  return QR_VERSION_SPECS.find((spec) => {
    const capacityBits = getTotalDataCodewords(spec) * 8;
    const requiredBits = 4 + 8 + byteLength * 8;
    return requiredBits <= capacityBits;
  }) || QR_VERSION_SPECS[QR_VERSION_SPECS.length - 1];
}

const gfExp: number[] = new Array(512).fill(0);
const gfLog: number[] = new Array(256).fill(0);
let value = 1;
for (let i = 0; i < 255; i += 1) {
  gfExp[i] = value;
  gfLog[value] = i;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d;
}
for (let i = 255; i < 512; i += 1) gfExp[i] = gfExp[i - 255];

function gfMultiply(a: number, b: number) {
  if (a === 0 || b === 0) return 0;
  return gfExp[gfLog[a] + gfLog[b]];
}

function createRsGenerator(degree: number) {
  let generator = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(generator.length + 1).fill(0);
    for (let j = 0; j < generator.length; j += 1) {
      next[j] ^= generator[j];
      next[j + 1] ^= gfMultiply(generator[j], gfExp[i]);
    }
    generator = next;
  }
  return generator;
}

function createErrorCorrectionCodewords(data: number[], degree: number) {
  const generator = createRsGenerator(degree);
  const result = new Array(degree).fill(0);

  data.forEach((byte) => {
    const factor = byte ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < degree; i += 1) {
      result[i] ^= gfMultiply(generator[i + 1], factor);
    }
  });

  return result;
}

function createFinalCodewords(dataCodewords: number[], spec: QrVersionSpec) {
  const blocks: { data: number[]; ec: number[] }[] = [];
  let offset = 0;

  spec.blockGroups.forEach((group) => {
    for (let i = 0; i < group.count; i += 1) {
      const data = dataCodewords.slice(offset, offset + group.dataCodewords);
      offset += group.dataCodewords;
      blocks.push({ data, ec: createErrorCorrectionCodewords(data, spec.ecCodewordsPerBlock) });
    }
  });

  const result: number[] = [];
  const maxDataLength = Math.max(...blocks.map((block) => block.data.length));
  for (let i = 0; i < maxDataLength; i += 1) {
    blocks.forEach((block) => {
      if (i < block.data.length) result.push(block.data[i]);
    });
  }

  for (let i = 0; i < spec.ecCodewordsPerBlock; i += 1) {
    blocks.forEach((block) => result.push(block.ec[i]));
  }

  return result;
}

function createMatrix(size: number) {
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
}

function createReserved(size: number) {
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
}

function setModule(matrix: QrMatrix, reserved: boolean[][], row: number, col: number, dark: boolean, isReserved = true) {
  if (row < 0 || col < 0 || row >= matrix.length || col >= matrix.length) return;
  matrix[row][col] = dark;
  if (isReserved) reserved[row][col] = true;
}

function drawFinder(matrix: QrMatrix, reserved: boolean[][], row: number, col: number) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const currentRow = row + dy;
      const currentCol = col + dx;
      const insideFinder = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const dark = insideFinder && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setModule(matrix, reserved, currentRow, currentCol, dark);
    }
  }
}

function drawAlignment(matrix: QrMatrix, reserved: boolean[][], centerRow: number, centerCol: number) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const dark = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
      setModule(matrix, reserved, centerRow + dy, centerCol + dx, dark);
    }
  }
}

function getBchVersionRemainder(version: number) {
  let value = version << 12;
  for (let i = 17; i >= 12; i -= 1) {
    if (((value >>> i) & 1) !== 0) value ^= 0x1f25 << (i - 12);
  }
  return value & 0xfff;
}

function reserveVersionAreas(reserved: boolean[][]) {
  const size = reserved.length;
  for (let i = 0; i < 18; i += 1) {
    const rowOrCol = Math.floor(i / 3);
    const offset = size - 11 + (i % 3);
    reserved[rowOrCol][offset] = true;
    reserved[offset][rowOrCol] = true;
  }
}

function drawVersionBits(matrix: QrMatrix, version: number) {
  if (version < 7) return;
  const size = matrix.length;
  const bits = (version << 12) | getBchVersionRemainder(version);
  for (let i = 0; i < 18; i += 1) {
    const bit = getBit(bits, i);
    const rowOrCol = Math.floor(i / 3);
    const offset = size - 11 + (i % 3);
    matrix[rowOrCol][offset] = bit;
    matrix[offset][rowOrCol] = bit;
  }
}

function drawFunctionPatterns(matrix: QrMatrix, reserved: boolean[][], spec: QrVersionSpec) {
  const size = matrix.length;
  drawFinder(matrix, reserved, 0, 0);
  drawFinder(matrix, reserved, 0, size - 7);
  drawFinder(matrix, reserved, size - 7, 0);

  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0;
    setModule(matrix, reserved, 6, i, dark);
    setModule(matrix, reserved, i, 6, dark);
  }

  spec.alignmentPatternPositions.forEach((row) => {
    spec.alignmentPatternPositions.forEach((col) => {
      const overlapsTopLeft = row <= 8 && col <= 8;
      const overlapsTopRight = row <= 8 && col >= size - 9;
      const overlapsBottomLeft = row >= size - 9 && col <= 8;
      if (!overlapsTopLeft && !overlapsTopRight && !overlapsBottomLeft) drawAlignment(matrix, reserved, row, col);
    });
  });

  for (let i = 0; i <= 8; i += 1) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i += 1) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }

  if (spec.version >= 7) reserveVersionAreas(reserved);

  setModule(matrix, reserved, 4 * spec.version + 9, 8, true);
}

function shouldApplyMask(mask: number, row: number, col: number) {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: return false;
  }
}

function placeDataBits(matrix: QrMatrix, reserved: boolean[][], codewords: number[], mask: number) {
  const size = matrix.length;
  const bits: number[] = [];
  codewords.forEach((codeword) => appendBits(bits, codeword, 8));

  let bitIndex = 0;
  let upward = true;
  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol -= 1;
    for (let vert = 0; vert < size; vert += 1) {
      const row = upward ? size - 1 - vert : vert;
      for (let colOffset = 0; colOffset < 2; colOffset += 1) {
        const col = rightCol - colOffset;
        if (reserved[row][col]) continue;
        const bit = (bits[bitIndex] || 0) === 1;
        bitIndex += 1;
        matrix[row][col] = bit !== shouldApplyMask(mask, row, col);
      }
    }
    upward = !upward;
  }
}

function getBchFormatRemainder(formatData: number) {
  let value = formatData << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if (((value >>> i) & 1) !== 0) value ^= 0x537 << (i - 10);
  }
  return value & 0x3ff;
}

function getFormatBits(mask: number) {
  const ecLevelM = 0b00;
  const data = (ecLevelM << 3) | mask;
  return ((data << 10) | getBchFormatRemainder(data)) ^ 0x5412;
}

function getBit(value: number, index: number) {
  return ((value >>> index) & 1) === 1;
}

function drawFormatBits(matrix: QrMatrix, mask: number) {
  const size = matrix.length;
  const bits = getFormatBits(mask);

  for (let i = 0; i <= 5; i += 1) matrix[i][8] = getBit(bits, i);
  matrix[7][8] = getBit(bits, 6);
  matrix[8][8] = getBit(bits, 7);
  matrix[8][7] = getBit(bits, 8);
  for (let i = 9; i < 15; i += 1) matrix[8][14 - i] = getBit(bits, i);

  for (let i = 0; i < 8; i += 1) matrix[8][size - 1 - i] = getBit(bits, i);
  for (let i = 8; i < 15; i += 1) matrix[size - 15 + i][8] = getBit(bits, i);
  matrix[size - 8][8] = true;
}

function calculatePenalty(matrix: QrMatrix) {
  const size = matrix.length;
  let penalty = 0;

  for (let row = 0; row < size; row += 1) {
    let sameCount = 1;
    for (let col = 1; col < size; col += 1) {
      if (matrix[row][col] === matrix[row][col - 1]) {
        sameCount += 1;
        if (sameCount === 5) penalty += 3;
        else if (sameCount > 5) penalty += 1;
      } else {
        sameCount = 1;
      }
    }
  }

  for (let col = 0; col < size; col += 1) {
    let sameCount = 1;
    for (let row = 1; row < size; row += 1) {
      if (matrix[row][col] === matrix[row - 1][col]) {
        sameCount += 1;
        if (sameCount === 5) penalty += 3;
        else if (sameCount > 5) penalty += 1;
      } else {
        sameCount = 1;
      }
    }
  }

  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      const color = matrix[row][col];
      if (color === matrix[row][col + 1] && color === matrix[row + 1][col] && color === matrix[row + 1][col + 1]) penalty += 3;
    }
  }

  const pattern = [true, false, true, true, true, false, true, false, false, false, false];
  const reversePattern = [...pattern].reverse();
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col <= size - 11; col += 1) {
      const line = matrix[row].slice(col, col + 11);
      if (pattern.every((bit, index) => line[index] === bit) || reversePattern.every((bit, index) => line[index] === bit)) penalty += 40;
    }
  }
  for (let col = 0; col < size; col += 1) {
    for (let row = 0; row <= size - 11; row += 1) {
      const line = Array.from({ length: 11 }, (_, index) => matrix[row + index][col]);
      if (pattern.every((bit, index) => line[index] === bit) || reversePattern.every((bit, index) => line[index] === bit)) penalty += 40;
    }
  }

  const darkCount = matrix.flat().filter(Boolean).length;
  const darkPercent = (darkCount * 100) / (size * size);
  penalty += Math.floor(Math.abs(darkPercent - 50) / 5) * 10;

  return penalty;
}

function buildQrMatrix(value: string, spec: QrVersionSpec, codewords: number[], mask: number) {
  const size = 21 + (spec.version - 1) * 4;
  const matrix = createMatrix(size);
  const reserved = createReserved(size);
  drawFunctionPatterns(matrix, reserved, spec);
  placeDataBits(matrix, reserved, codewords, mask);
  drawFormatBits(matrix, mask);
  drawVersionBits(matrix, spec.version);
  return matrix;
}

export function createInrBadgeQrMatrix(rawValue: string): QrMatrix {
  const value = String(rawValue || "").trim();
  if (!value) return [];

  const spec = chooseVersion(value);
  const byteLength = new TextEncoder().encode(value).length;
  const maxBits = getTotalDataCodewords(spec) * 8;
  const requiredBits = 4 + 8 + byteLength * 8;
  if (requiredBits > maxBits) {
    throw new Error("URL iNr'Badge trop longue pour le QR Code V1.");
  }

  const dataCodewords = createDataCodewords(value, spec);
  const finalCodewords = createFinalCodewords(dataCodewords, spec);

  let bestMask = 0;
  let bestMatrix = buildQrMatrix(value, spec, finalCodewords, bestMask);
  let bestPenalty = calculatePenalty(bestMatrix);

  for (let mask = 1; mask < 8; mask += 1) {
    const candidate = buildQrMatrix(value, spec, finalCodewords, mask);
    const penalty = calculatePenalty(candidate);
    if (penalty < bestPenalty) {
      bestMask = mask;
      bestMatrix = candidate;
      bestPenalty = penalty;
    }
  }

  return bestMatrix;
}
