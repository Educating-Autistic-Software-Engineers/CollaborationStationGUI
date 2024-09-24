import ScratchStorage from 'scratch-storage';

import defaultProject from './default-project';

/**
 * Wrapper for ScratchStorage which adds default web sources.
 * @todo make this more configurable
 */
class Storage extends ScratchStorage {
    constructor () {
        super();
        this.cacheDefaultProject();
        this.updateCustomAssets();
    }
    async updateCustomAssets() {
        this.assets = {}
        // const response = await fetch("https://0dhyl8bktg.execute-api.us-east-2.amazonaws.com/scratchBlock/assetID",{
        //     method: 'GET'
        // })
        // const reader = response.body.getReader();
        // const decoder = new TextDecoder('utf-8');
        // let chunks = [];
        // while (true) {
        //     const { done, value } = await reader.read();
        //     if (done) {
        //         break;
        //     }
        //     chunks.push(value);
        // }
        // const concatenated = new Uint8Array(chunks.reduce((acc, chunk) => acc.concat(Array.from(chunk)), []));
        // const jsonString = decoder.decode(concatenated);
        // console.log("ASSETIDS", jsonString)
        // const data = JSON.parse(JSON.parse(jsonString));
        // for (const asset of data) {
        //     // console.log(asset)
        //     this.assets[asset.assetID] = asset;
        // }
    }
    addOfficialScratchWebStores () {
        this.addWebStore(
            [this.AssetType.Project],
            this.getProjectGetConfig.bind(this),
            this.getProjectCreateConfig.bind(this),
            this.getProjectUpdateConfig.bind(this)
        );
        this.addWebStore(
            [this.AssetType.ImageVector, this.AssetType.ImageBitmap, this.AssetType.Sound],
            this.getAssetGetConfig.bind(this),
            // We set both the create and update configs to the same method because
            // storage assumes it should update if there is an assetId, but the
            // asset store uses the assetId as part of the create URI.
            this.getAssetCreateConfig.bind(this),
            this.getAssetCreateConfig.bind(this)
        );
        this.addWebStore(
            [this.AssetType.Sound],
            asset => `static/extension-assets/scratch3_music/${asset.assetId}.${asset.dataFormat}`
        );
    }
    setProjectHost (projectHost) {
        this.projectHost = projectHost;
    }
    setProjectToken (projectToken) {
        this.projectToken = projectToken;
    }
    getProjectGetConfig (projectAsset) {
        const path = `${this.projectHost}/${projectAsset.assetId}`;
        const qs = this.projectToken ? `?token=${this.projectToken}` : '';
        return path + qs;
    }
    getProjectCreateConfig () {
        return {
            url: `${this.projectHost}/`,
            withCredentials: true
        };
    }
    getProjectUpdateConfig (projectAsset) {
        return {
            url: `${this.projectHost}/${projectAsset.assetId}`,
            withCredentials: true
        };
    }
    setAssetHost (assetHost) {
        console.log("ASSETHOST", assetHost)
        this.assetHost = assetHost;
    }
    getAssetGetConfig (asset) {
        console.log(`${this.assetHost}/internalapi/asset/${asset.assetId}.${asset.dataFormat}/get/`)
        // console.log(`${this.assetHost}/internalapi/asset/${asset.assetId}.${asset.dataFormat}/get/`)
        // if (asset.dataFormat == "wav")
        //     return `${this.assetHost}/internalapi/asset/${asset.assetId}.${asset.dataFormat}/get/`;
        // return "https://cdn.assets.scratch.mit.edu/internalapi/asset/" + asset.assetId + "." + asset.dataFormat + "/get/";
        // console.log(`${this.assetHost}/internalapi/${asset.assetId}.${asset.dataFormat}`)
        // return `${this.assetHost}/internalapi/${asset.assetId}.${asset.dataFormat}/get/`;
        // if (asset.dataFormat === "svg")
        //     return "https://0dhyl8bktg.execute-api.us-east-2.amazonaws.com/scratchBlock/images?fileName=390845c11df0924f3b627bafeb3f814e.svg"
        // console.log(`https://0dhyl8bktg.execute-api.us-east-2.amazonaws.com/scratchBlock/images?fileName=${asset.assetId}.${asset.dataFormat}`)
        console.log(`https://d3pl0tx5n82s71.cloudfront.net/${asset.assetId}.${asset.dataFormat}`)
        return `https://d3pl0tx5n82s71.cloudfront.net/${asset.assetId}.${asset.dataFormat}`
        // return `https://0dhyl8bktg.execute-api.us-east-2.amazonaws.com/scratchBlock/images?fileName=${asset.assetId}.${asset.dataFormat}`
    }
    getAssetCreateConfig (asset) {
        return {
            // There is no such thing as updating assets, but storage assumes it
            // should update if there is an assetId, and the asset store uses the
            // assetId as part of the create URI. So, force the method to POST.
            // Then when storage finds this config to use for the "update", still POSTs
            method: 'post',
            url: `${this.assetHost}/${asset.assetId}.${asset.dataFormat}`,
            withCredentials: true
        };
    }
    setTranslatorFunction (translator) {
        this.translator = translator;
        this.cacheDefaultProject();
    }
    cacheDefaultProject () {
        const defaultProjectAssets = defaultProject(this.translator);
        defaultProjectAssets.forEach(asset => this.builtinHelper._store(
            this.AssetType[asset.assetType],
            this.DataFormat[asset.dataFormat],
            asset.data,
            asset.id
        ));
    }
}

const storage = new Storage();

export default storage;
