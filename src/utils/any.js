module.exports = function any(schema, options) {
    schema.statics.any = async function (query) {
        const result = await this.countDocuments({_id: query});
        return result > 0 ? true : false;
      };
}