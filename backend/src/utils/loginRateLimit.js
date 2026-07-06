function isCountableLoginAttemptResponse(_request, response) {
    return response.statusCode < 500;
}

module.exports = { isCountableLoginAttemptResponse };
