app.get("/waitingroom/api/waitingroom", async (c) => {
    const { ticket } = c.req.query();
    if (ticket) {
        return c.body(null, 204);
    }

    let time = 0;

    if (playerscount >= 1) { // this acctualy should work but nah it doesnt good!
        time = 67
    }

    return c.json ({
        ticketid: uuidv4(),
        expectedWait: time,
        retryTime: time,
        throttled: false,
    });
});