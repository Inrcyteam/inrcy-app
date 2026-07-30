declare module "bmp-js" {
  export type DecodedBmp = {
    width: number;
    height: number;
    bitPP: number;
    data: Buffer;
  };

  const bmp: {
    decode(_input: Buffer): DecodedBmp;
    encode(_input: {
      width: number;
      height: number;
      data: Buffer;
    }): {
      width: number;
      height: number;
      data: Buffer;
    };
  };

  export default bmp;
}
