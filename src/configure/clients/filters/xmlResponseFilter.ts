export class XmlResponseFilter {
    public static CREATE() {
        return (resource, next, callback) => {
            const handleXmlBody = (err, response, body) => {
                if (response && response.headers &&
                    response.headers["content-type"] &&
                    response.headers["content-type"] === "application/xml" &&
                    body &&
                    response.statusCode == 200) {
                    body = JSON.stringify(body.replace('"', '\"'));
                }
                callback(err, response, body);
            };

            return next(resource, handleXmlBody);
        };
    }
}
