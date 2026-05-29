export const handler = async (event) => {
    console.log("event", JSON.stringify(event, null, 2));
    //JSON.stringifyはJavaScriptのオブジェクトをJSONっぽい文字列に変換しているその逆はJSON.parseである。
    //引数の 1 は文字列にしたいJavaScriptのオブジェクト。
    //引数の 2 は変換ルール設定。今回は特にないので null。 
    //引数の 3 はインデント。今回は2スペースなので 2 を指定している。CloudWatch Logs で確認するときに綺麗に見える。
    for (const record of event.Records) {
        const bucket = record.s3.bucket.name;
        const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
        // S3イベントで渡ってくる object.key は、URL用にエンコードされた形になっていることがあるので、値が記号の羅列の
        // ようなものになる場合がある、それを読める形に戻すのがdecodeURIComponentである。
        console.log("bucket:", bucket);
        console.log("key:", key);
    }
    return {
        ok: true,
    };
};
