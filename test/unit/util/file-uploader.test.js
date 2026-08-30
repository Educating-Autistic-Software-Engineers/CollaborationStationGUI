jest.mock('scratch-svg-renderer', () => ({
    BitmapAdapter: jest.fn().mockImplementation(() => ({
        importBitmap: jest.fn(() => Promise.resolve(new Uint8Array([1, 2, 3])))
    })),
    sanitizeSvg: {
        sanitizeByteStream: jest.fn(data => data)
    }
}));

jest.mock('../../../src/lib/bmp-converter', () => jest.fn());
jest.mock('../../../src/lib/gif-decoder', () => jest.fn());
jest.mock('../../../src/lib/randomize-sprite-position.js', () => jest.fn());

import {costumeUpload} from '../../../src/lib/file-uploader';

describe('costumeUpload', () => {
    const storage = {
        DataFormat: {
            SVG: 'svg',
            JPG: 'jpg',
            PNG: 'png'
        },
        AssetType: {
            ImageVector: 'vector',
            ImageBitmap: 'bitmap'
        },
        createAsset: jest.fn(() => ({assetId: 'asset-id'}))
    };

    beforeEach(() => {
        storage.createAsset.mockClear();
    });

    test('accepts image/jpg uploads as bitmap costumes', async () => {
        const handleCostume = jest.fn();

        costumeUpload(
            new ArrayBuffer(8),
            'image/jpg',
            storage,
            handleCostume,
            jest.fn()
        );

        await Promise.resolve();

        expect(handleCostume).toHaveBeenCalledTimes(1);
        expect(handleCostume).toHaveBeenCalledWith([
            expect.objectContaining({
                dataFormat: 'jpg',
                md5: 'asset-id.jpg',
                assetId: 'asset-id'
            })
        ]);
        expect(storage.createAsset).toHaveBeenCalled();
    });
});